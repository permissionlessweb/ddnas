export interface JackalSuccessResponse {
  cid: string
  id: string
  merkle: string
  name: string
  // ... other fields
}

export interface JackalErrorResponse {
  message: string
  errors?: string[]
  maxSize?: number
  // ... other fields
}
