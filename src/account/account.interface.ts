export interface GitSwitchAccount {
  name: string;
  githubUsername: string;
  displayName: string;
  email: string;
  hostAlias: string;
  sshKey: string;
  authType: 'oauth' | 'token';
  createdAt: string;
}
