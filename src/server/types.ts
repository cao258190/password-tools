export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  cryptoSalt: string;
  isAdmin: boolean;
  tokenVersion: number;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export {};
