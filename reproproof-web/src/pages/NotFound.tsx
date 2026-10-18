import { Link } from 'react-router-dom'
export default function NotFound() { return <main className="not-found"><span className="eyebrow">404 · PAGE NOT FOUND</span><h1>This page wandered off.</h1><p>The link may be outdated, or the page may have moved.</p><Link to="/" className="primary-button">Back to overview</Link></main> }
