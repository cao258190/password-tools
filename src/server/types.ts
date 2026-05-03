export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  cryptoSalt: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export {};
