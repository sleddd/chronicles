import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    schemaName: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      schemaName: string;
    };
    sessionToken?: string;
  }
}
