import { useState, type FormEvent } from 'react'
import { Save, UserRound } from 'lucide-react'
import { getLocalProfile, saveLocalProfile } from '../api/profile'
import './Profile.css'

export default function Profile() {
  const [profile, setProfile] = useState(getLocalProfile)
  const [saved, setSaved] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = { name: profile.name.trim(), role: profile.role.trim() }
    if (!next.name || !next.role) return
    saveLocalProfile(next)
    setProfile(next)
    setSaved(true)
  }

  return <main className="page profile-page">
    <div className="profile-heading">
      <span className="eyebrow">ACCOUNT</span>
      <h1>Manage your profile</h1>
      <p>Update the name and role shown in the RepoProof workspace header.</p>
    </div>
    <form className="panel profile-form" onSubmit={submit}>
      <div className="profile-form-title">
        <span className="profile-form-icon"><UserRound size={20}/></span>
        <div><h2>Profile details</h2><p>These details are saved locally in this browser.</p></div>
      </div>
      <label>Display name
        <input required maxLength={60} value={profile.name} onChange={event=>{setProfile({...profile,name:event.target.value});setSaved(false)}} />
      </label>
      <label>Role
        <input required maxLength={60} value={profile.role} onChange={event=>{setProfile({...profile,role:event.target.value});setSaved(false)}} />
      </label>
      <div className="profile-form-footer">
        <span className="profile-local-note">Local browser profile · not synced to an account service</span>
        <div>{saved&&<span className="profile-saved" role="status">Saved on this browser</span>}<button className="primary-button" type="submit"><Save size={14}/> Save profile</button></div>
      </div>
    </form>
  </main>
}
