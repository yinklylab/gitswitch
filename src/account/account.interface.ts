export interface GitSwitchAccount {
  profile: string;
  githubUsername: string;
  name: string;
  email: string;
  hostAlias: string;
  sshKey: string;
  authType: 'oauth' | 'token';
  createdAt: string;
}

export type StoredGitSwitchAccount = Partial<GitSwitchAccount> & {
  name?: string;
};
