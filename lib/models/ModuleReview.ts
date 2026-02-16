export interface ModuleReview {
  moduleId: string;
  userId: string;
  userName?: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}
