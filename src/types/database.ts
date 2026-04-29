export type UserRole = 'admin' | 'teacher' | 'student'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  username: string | null
  role: UserRole
  avatar_url: string | null
  azure_oid: string | null
  created_at: string
  updated_at: string
}