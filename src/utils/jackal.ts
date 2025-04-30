export interface JackalSuccessResponse {
  cid: string
  fileType: string
  fileId: string
  // ... other fields
}

export interface JackalErrorResponse {
  message: string
  errors?: string[]
  maxSize?: number
  // ... other fields
}
