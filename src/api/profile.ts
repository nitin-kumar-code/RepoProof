export type LocalProfile = {
  name: string
  role: string
}

const storageKey = 'reproproof.local-profile'
export const LOCAL_PROFILE_UPDATED = 'reproproof:local-profile-updated'

const defaultProfile: LocalProfile = { name: 'Alex Chen', role: 'QA Lead' }

export function getLocalProfile(): LocalProfile {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return defaultProfile
    const value = JSON.parse(stored) as Partial<LocalProfile>
    return {
      name: typeof value.name === 'string' && value.name.trim() ? value.name : defaultProfile.name,
      role: typeof value.role === 'string' && value.role.trim() ? value.role : defaultProfile.role,
    }
  } catch {
    return defaultProfile
  }
}

export function saveLocalProfile(profile: LocalProfile): void {
  window.localStorage.setItem(storageKey, JSON.stringify(profile))
  window.dispatchEvent(new Event(LOCAL_PROFILE_UPDATED))
}
