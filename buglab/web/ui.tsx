import { useEffect, useState } from 'react'
import { product, syntheticToken, type CartState, type SandboxRecord } from '../shared/data.js'
import { scenarios } from '../shared/scenarios.js'

type DeletionApproval = { approvalId: string; recordIds: string[]; approvedAt: string; expiresAt: string }
type View = 'home' | 'product' | 'cart' | 'profile' | 'sandbox' | 'scenarios' | 'scenario'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Request failed (${response.status})`)
  return data as T
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function currentView(): { view: View; scenarioId?: string } {
  const path = window.location.pathname
  if (path.startsWith('/products/')) return { view: 'product' }
  if (path === '/cart') return { view: 'cart' }
  if (path === '/profile') return { view: 'profile' }
  if (path === '/sandbox') return { view: 'sandbox' }
  if (path === '/scenarios') return { view: 'scenarios' }
  const match = path.match(/^\/scenarios\/(TC[1-4])$/)
  if (match) return { view: 'scenario', scenarioId: match[1] }
  return { view: 'home' }
}

export function BugLab() {
  const route = currentView()
  const [cart, setCart] = useState<CartState | null>(null)
  const [records, setRecords] = useState<SandboxRecord[]>([])
  const [stateVersion, setStateVersion] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [approval, setApproval] = useState<DeletionApproval | null>(null)
  const [tokenLoaded, setTokenLoaded] = useState(false)
  const [logs, setLogs] = useState<Array<{ type: string; message: string; createdAt: string }>>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refreshLogs = async () => setLogs((await api<{ logs: typeof logs }>('/test-logs')).logs)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [cartResult, sandboxResult, logResult] = await Promise.all([
          api<CartState>('/cart'),
          api<{ stateVersion: number; records: SandboxRecord[] }>('/sandbox/records'),
          api<{ logs: Array<{ type: string; message: string; createdAt: string }> }>('/test-logs'),
        ])
        if (!active) return
        setCart(cartResult)
        setRecords(sandboxResult.records)
        setStateVersion(sandboxResult.stateVersion)
        setLogs(logResult.logs)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load BugLab.')
      }
    })()
    return () => { active = false }
  }, [])

  const addToCart = async () => {
    try {
      setError('')
      const next = await api<CartState>('/cart/items', { method: 'POST', body: JSON.stringify({ productId: product.id }) })
      setCart(next)
      if (next.tc1Failure) console.error("Cart subtotal omits the second item's price. [TC1]")
      setNotice(`${product.name} added to cart.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the cart.') }
  }

  const resetSandbox = async () => {
    try {
      const result = await api<{ reset: boolean; stateVersion: number; records: SandboxRecord[]; cart: CartState }>('/sandbox/ui-reset', { method: 'POST', body: '{}' })
      setRecords(result.records)
      setCart(result.cart)
      setStateVersion(result.stateVersion)
      setSelected([])
      setApproval(null)
      setNotice('Sandbox reset to the original synthetic seed data.')
      await refreshLogs()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reset the sandbox.') }
  }

  const requestDeletionApproval = async () => {
    try {
      const response = await api<DeletionApproval>('/sandbox/deletion-approvals', {
        method: 'POST',
        body: JSON.stringify({ recordIds: selected, confirmation: phrase }),
      })
      setApproval(response)
      setNotice(`Approval recorded for ${response.recordIds.length} exact record(s).`)
      setError('')
    } catch (cause) { setApproval(null); setError(cause instanceof Error ? cause.message : 'Deletion approval was rejected.') }
  }

  const executeApprovedDeletion = async () => {
    if (!approval) return
    try {
      const result = await api<{ deletedIds: string[]; stateVersion: number; remainingRecords: SandboxRecord[] }>('/sandbox/records/delete', {
        method: 'POST',
        body: JSON.stringify({ approvalId: approval.approvalId, recordIds: approval.recordIds }),
      })
      setRecords(result.remainingRecords)
      setStateVersion(result.stateVersion)
      setSelected([])
      setApproval(null)
      setDialogOpen(false)
      setPhrase('')
      setNotice(`Deleted ${result.deletedIds.length} approved disposable record(s).`)
      await refreshLogs()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Approved deletion failed.') }
  }

  const loadToken = async () => {
    try {
      await api<{ detected: boolean; token: string }>('/scenarios/token', { method: 'POST', body: '{}' })
      setTokenLoaded(true)
      const variants = [
        `Authorization: Bearer test_secret_12345`,
        `access_token=${syntheticToken}`,
        `console: token=${syntheticToken}`,
      ]
      for (const message of variants) await api('/test-logs', { method: 'POST', body: JSON.stringify({ type: 'TC4 synthetic variant', message }) })
      await refreshLogs()
      setNotice('Synthetic token detected. The displayed value is visually masked; stored log variants are redacted.')
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the synthetic token fixture.') }
  }

  const scenario = scenarios.find(item => item.id === route.scenarioId)

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="BugLab home"><span className="brand-mark">BL</span><span><strong>BugLab</strong><small>REPROPROOF TEST STORE</small></span></a>
      <nav aria-label="Main navigation">
        <a href="/">Shop</a><a href="/products/alpine-trail-backpack">Product</a><a href="/cart">Cart <span className="cart-count" data-testid="cart-quantity">{cart?.quantity ?? 0}</span></a><a href="/profile">Profile</a><a href="/sandbox">Sandbox</a><a href="/scenarios">Test scenarios</a>
      </nav>
      <span className="sandbox-badge">Synthetic sandbox</span>
    </header>

    <main>
      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      {(route.view === 'home' || route.view === 'product') && <>
        <section className="hero">
          <p className="eyebrow">CONTROLLED REPRODUCTION TARGET</p>
          <h1>A small store for<br /><em>repeatable bug hunts.</em></h1>
          <p>Every order and account is synthetic. Use the scenario guide to reproduce known behavior, reset the seed state, and inspect safe test logs.</p>
          <a className="button dark" href="/scenarios">Explore test scenarios <span aria-hidden="true">→</span></a>
        </section>

        <section className="content-section product-section" aria-labelledby="products-heading">
          <div className="section-heading"><div><p className="eyebrow">THE DEMO CATALOG</p><h2 id="products-heading">One useful thing.</h2></div><span className="muted">Seeded product · no checkout or payment processor</span></div>
          <article className="product-card" data-testid="product-card">
            <a className="product-art" href="/products/alpine-trail-backpack" aria-label={`View ${product.name}`}><span aria-hidden="true">{product.image}</span><small>FIELD KIT / 001</small></a>
            <div className="product-copy"><p className="eyebrow">BUGLAB OUTFITTERS</p><h3><a href="/products/alpine-trail-backpack">{product.name}</a></h3><p>{product.description}</p><div className="product-actions"><strong>{money(product.priceCents)}</strong><button className="button primary" data-testid="add-to-cart" onClick={() => void addToCart()}>Add Alpine Trail Backpack to cart</button><a href="/cart">Open cart</a></div></div>
          </article>
          {route.view === 'product' && <div className="detail-note"><strong>Product details</strong><span>28L capacity · synthetic product fixture · stable ID <code>{product.id}</code></span></div>}
        </section>
      </>}

      {route.view === 'cart' && <section className="content-section page-section" data-testid="cart-page"><p className="eyebrow">YOUR TEST CART</p><h1>Shopping cart</h1><div className="cart-panel">
        {(cart?.quantity ?? 0) === 0 ? <div className="empty-cart"><span aria-hidden="true">🛒</span><h2>Your cart is empty</h2><p>Add the seeded product to begin a scenario.</p><a className="button primary" href="/">Browse product</a></div> : <>
          <div className="cart-row"><span className="cart-product-icon" aria-hidden="true">{product.image}</span><div><strong>{product.name}</strong><small>{money(product.priceCents)} each · synthetic item</small></div><span className="quantity-pill" data-testid="cart-quantity-value">Qty {cart?.quantity}</span><strong>{money(cart?.subtotalCents ?? 0)}</strong></div>
          <div className="cart-summary"><span>Subtotal</span><strong data-testid="cart-subtotal">{money(cart?.subtotalCents ?? 0)}</strong></div>
          {cart?.tc1Failure && <div className="defect-callout" data-testid="tc1-failure"><strong>TC1 observed behavior</strong><span>Cart subtotal omits the second item's price.</span><small>Expected {money(cart.expectedSubtotalCents)} · observed {money(cart.subtotalCents)} · fingerprint <code>{cart.fingerprint?.slice(0, 12)}</code></small></div>}
          <div className="cart-actions"><button className="button secondary" onClick={() => void addToCart()}>Add Alpine Trail Backpack to cart</button><a href="/">Continue shopping</a></div>
        </>}
      </div></section>}

      {route.view === 'profile' && <section className="content-section page-section" data-testid="profile-page"><p className="eyebrow">SYNTHETIC PROFILE</p><h1>Account details</h1><div className="profile-card"><div className="avatar">AD</div><div><h2>Avery Demo</h2><p>avery.demo@example.test</p><span className="status-pill">Test account · no authentication</span></div></div><div className="detail-note"><strong>Privacy note</strong><span>This profile is hard-coded fixture data. No customer records or credentials are connected.</span></div></section>}

      {route.view === 'sandbox' && <section className="content-section page-section" data-testid="sandbox-page"><div className="section-heading"><div><p className="eyebrow">DISPOSABLE FIXTURES</p><h1>Sandbox records</h1><p className="muted">Only these seeded synthetic records can be deleted. Current seed version: <code data-testid="sandbox-version">{stateVersion}</code>.</p></div><button className="button secondary" data-testid="reset-sandbox" onClick={() => void resetSandbox()}>Reset sandbox</button></div>
        <div className="records-list">{records.map(record => <label className="record-row" data-testid="sandbox-record" key={record.id}><input type="checkbox" checked={selected.includes(record.id)} onChange={event => setSelected(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))} /><span className="record-glyph">{record.kind === 'test-order' ? '▤' : record.kind === 'test-customer' ? '◉' : '▣'}</span><span><strong>{record.name}</strong><small>{record.kind} · <code>{record.id}</code></small></span><span className="disposable">DISPOSABLE</span></label>)}</div>
        <div className="danger-zone"><div><strong>Delete selected records</strong><p>This removes only selected BugLab fixtures. A typed confirmation and server-issued one-time approval are required.</p></div><button className="button danger" data-testid="delete-record" disabled={!selected.length} onClick={() => { setDialogOpen(true); setApproval(null); setPhrase('') }}>Review deletion ({selected.length})</button></div>
        <div className="log-panel"><div className="section-heading"><div><p className="eyebrow">SANITIZED EVENT LOG</p><h2>Safe to inspect or export</h2></div><a className="text-link" href="/api/test-logs/export">Download sanitized JSON</a></div>{logs.length ? logs.map((log, index) => <div className="log-row" key={`${log.createdAt}-${index}`}><code>{log.type}</code><span>{log.message}</span></div>) : <p className="muted">No test events yet.</p>}</div>
      </section>}

      {route.view === 'scenarios' && <section className="content-section page-section"><p className="eyebrow">JUDGE HANDOFF / REPRO STEPS</p><h1>Test scenarios</h1><p className="intro">Four deterministic cases for exploring ReproProof’s planning, approval, browser evidence, and redaction workflow.</p><div className="scenario-grid">{scenarios.map(item => <a className="scenario-card" href={`/scenarios/${item.id}`} key={item.id}><span className="scenario-id">{item.id}</span><h2>{item.title}</h2><p>{item.initialState}</p><span className="text-link">Open scenario →</span></a>)}</div></section>}

      {route.view === 'scenario' && scenario && <section className="content-section page-section scenario-detail" data-testid={`scenario-${scenario.id}`}><a className="back-link" href="/scenarios">← All scenarios</a><p className="eyebrow">{scenario.id} / CONTROLLED CASE</p><h1>{scenario.title}</h1><p className="intro">{scenario.initialState}</p><div className="scenario-columns"><article><h2>Reproduction steps</h2><ol>{scenario.steps.map(step => <li key={step}>{step}</li>)}</ol></article><article><h2>Expected vs. observed</h2><p><strong>Expected:</strong> {scenario.expectedResult}</p><p><strong>Reported actual:</strong> {scenario.actualBehavior}</p><h2>Capture</h2><ul>{scenario.evidence.map(item => <li key={item}>{item}</li>)}</ul></article></div>
        {scenario.id === 'TC1' && <div className="scenario-action"><a className="button primary" href="/">Open store and reproduce TC1</a><a href="/cart">Open cart</a></div>}
        {scenario.id === 'TC2' && <div className="scenario-action"><a className="button primary" href="/">Open store for one-item check</a><a href="/cart">Open cart</a></div>}
        {scenario.id === 'TC3' && <div className="scenario-action"><a className="button primary" href="/sandbox">Open disposable sandbox records</a><span className="callout">Deletion stays inside BugLab and requires a scoped server approval.</span></div>}
        {scenario.id === 'TC4' && <div className="token-panel"><div><h2>Synthetic token probe</h2><p>Click to load a nonfunctional test string. It is present in the DOM for inspection, masked in rendered pixels, and redacted before logs are stored.</p></div><button className="button primary" onClick={() => void loadToken()} data-testid="load-synthetic-token">Load synthetic token</button>{tokenLoaded && <div className="token-output" data-testid="synthetic-token-output" data-sensitive="true" aria-label="Synthetic token loaded and visually masked">{syntheticToken}</div>}</div>}
      </section>}
    </main>

    <footer><span>BugLab · isolated synthetic test target</span><span>No payment processor · no production data · local only</span></footer>

    {dialogOpen && <div className="dialog-backdrop"><section className="approval-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" data-testid="delete-confirmation"><button className="dialog-close" aria-label="Close deletion review" onClick={() => setDialogOpen(false)}>×</button><p className="eyebrow danger-ink">DESTRUCTIVE SANDBOX ACTION</p><h2 id="delete-title">Review records to delete</h2><p>This approval is tied to the exact selected IDs and current sandbox version. It expires after five minutes and can be used once.</p><ul>{records.filter(record => selected.includes(record.id)).map(record => <li key={record.id}><strong>{record.name}</strong><code>{record.id}</code></li>)}</ul><label className="field-label" htmlFor="delete-approval-phrase">Type <code>{`DELETE ${selected.length} SANDBOX RECORD${selected.length === 1 ? '' : 'S'}`}</code> to approve</label><input id="delete-approval-phrase" data-testid="delete-approval-phrase" value={phrase} onChange={event => setPhrase(event.target.value)} autoComplete="off" />{approval && <p className="approval-receipt" role="status">Approved {new Date(approval.approvedAt).toLocaleTimeString()} · expires {new Date(approval.expiresAt).toLocaleTimeString()}</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => setDialogOpen(false)}>Cancel</button>{!approval ? <button className="button danger" data-testid="approve-deletion" onClick={() => void requestDeletionApproval()} disabled={!selected.length}>Approve exact record set</button> : <button className="button danger" data-testid="delete-approved-records" onClick={() => void executeApprovedDeletion()}>Execute approved deletion</button>}</div></section></div>}
  </div>
}
