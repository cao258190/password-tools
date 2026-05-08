export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  cryptoSalt: string;
  vaultVerifier: string | null;
  vaultKdfIterations: number;
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
