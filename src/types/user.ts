export type UserRole = 'admin' | 'teacher' | 'student'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  role: UserRole
  institution: string | null
  created_at: string
  updated_at: string
}