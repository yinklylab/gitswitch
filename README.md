# GitSwitch — Multi-GitHub Identity Setup Without the Configuration Headache

**GitSwitch** is a developer-focused CLI by **Yinkly** that simplifies setting up and managing multiple GitHub identities on one machine.

Git and SSH already provide the building blocks for working with multiple identities.

GitSwitch automates the setup and connects those pieces into one developer workflow.

**No manual SSH configuration.**
**No copying public keys.**
**No repeated Git configuration.**
**No guessing which SSH identity your repository uses.**

Set up your GitHub identities once. Use them across your repositories.

---

## ✨ Why GitSwitch?

Managing multiple GitHub accounts is possible with Git, SSH, and GitHub's existing tools.

But setting everything up correctly can involve:

* Creating separate SSH keys
* Uploading public keys to the correct GitHub accounts
* Editing your SSH configuration
* Creating separate Git configurations
* Managing Git author names and emails
* Rewriting repository remote URLs
* Remembering which identity a repository should use

GitSwitch brings this workflow into one CLI.

The goal is not to replace Git, SSH, or GitHub CLI.

The goal is to automate the repetitive configuration around them.

---

## GitHub OAuth Setup

GitSwitch uses GitHub OAuth Device Flow to connect your GitHub account.

Run:

```bash
gitswitch setup
```

GitSwitch will:

* Ask for a local profile name
* Open GitHub authorization in your browser
* Retrieve your authenticated GitHub identity
* Retrieve your Git name and primary email
* Store the GitHub token securely
* Generate a dedicated SSH key
* Upload the SSH public key to GitHub automatically
* Configure your local SSH identity
* Configure your Git identity
* Verify the SSH connection
* Save your GitSwitch profile

No GitHub username entry.

No Personal Access Token entry.

No copying SSH keys.

No opening GitHub SSH settings.

Login once. GitSwitch handles the setup.

---

## Multi-Account Profile Management

Create profiles for your different GitHub identities.

Example:

```text
personal (yinklylab)
work (company-user)
client (client-account)
```

GitSwitch helps you:

* Manage personal, work, and client GitHub identities
* Create named profiles
* Configure profile-specific Git settings
* Maintain isolated SSH identities
* View your active GitSwitch profile
* Switch between configured profiles
* Remove local GitSwitch profiles safely
* Preserve legacy GitSwitch configurations

Run:

```bash
gitswitch list
```

Example:

```text
Configured GitSwitch profiles

1. work ← active
   GitHub: company-user
   SSH: github-work
   Auth: oauth

2. personal
   GitHub: yinklylab
   SSH: github-personal
   Auth: oauth
```

---

## Automatic SSH Management

GitSwitch creates a dedicated SSH key for each profile.

Example:

```text
~/.ssh/

gitswitch_work
gitswitch_work.pub

gitswitch_personal
gitswitch_personal.pub
```

GitSwitch automatically configures SSH aliases:

```text
Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/gitswitch_work
  IdentitiesOnly yes
```

The public SSH key is uploaded directly to the authenticated GitHub account.

GitSwitch then verifies the SSH connection before completing setup.

Your private SSH keys remain on your machine.

---

## Switch GitHub Identities

Switch to a configured profile:

```bash
gitswitch use work
```

GitSwitch:

* Loads the selected profile
* Retrieves its stored authentication token
* Verifies the GitHub account
* Activates the profile's Git configuration
* Records the active GitSwitch profile

Example:

```text
Verified token belongs to 'company-user'.

Switched successfully to 'work' (company-user).
```

View your current profile:

```bash
gitswitch current
```

Example:

```text
Current GitSwitch Profile

Profile: work
GitHub: company-user
Name: Oluyinka
Email: developer@company.com
SSH Host: github-work
Auth: oauth
```

---

## Clone With the Correct SSH Identity

Instead of manually constructing SSH aliases:

```text
git@github-work:user/project.git
```

Run:

```bash
gitswitch clone work https://github.com/user/project.git
```

GitSwitch converts:

```text
https://github.com/user/project.git

↓

git@github-work:user/project.git
```

SSH repository URLs are also supported:

```bash
gitswitch clone work git@github.com:user/project.git
```

GitSwitch uses the SSH identity associated with the selected profile.

---

## Update a Repository Remote Identity

For an existing repository:

```bash
gitswitch remote work
```

Before:

```text
git@github.com:user/project.git
```

After:

```text
git@github-work:user/project.git
```

GitSwitch updates the repository's `origin` remote automatically.

No manual `git remote set-url` command required.

---

## Push Using a GitSwitch Profile

Push using a configured identity:

```bash
gitswitch push work
```

GitSwitch prepares the repository remote for the selected profile before pushing.

Example:

```text
Preparing push with 'work'...

Switching repository remote to 'work'...

Remote updated:
git@github-work:company/project.git

Current branch:
feature/payment

Push where?

❯ Current branch
  Different branch
```

Push directly to a branch:

```bash
gitswitch push work main
```

GitSwitch ensures the repository remote uses the selected profile's SSH identity before pushing.

---

# GitSwitch Doctor

Run:

```bash
gitswitch doctor
```

GitSwitch Doctor checks:

* Git installation
* SSH installation
* Configured GitSwitch profiles
* SSH key availability
* GitSwitch SSH aliases
* GitHub SSH authentication identity
* Current Git repository
* Current branch
* Repository remote

Example:

```text
🩺 GitSwitch Health Check

✓ Git installed
✓ SSH installed
✓ 2 GitSwitch profiles configured
✓ work SSH key exists
✓ personal SSH key exists
✓ work SSH connected as company-user
✓ personal SSH connected as yinklylab
✓ Current directory is a Git repository
✓ Current branch: develop
✓ Remote configured: git@github-work:company/project.git

Health check completed
```

GitSwitch Doctor verifies the SSH aliases created by GitSwitch instead of checking only the default `github.com` SSH connection.

---

# Installation

Install globally with npm:

```bash
npm install -g @yinklylab.dev/gitswitch
```

Or with Yarn:

```bash
yarn global add @yinklylab.dev/gitswitch
```

Verify the installation:

```bash
gitswitch -v
```

---

# Quick Start

## 1. Connect your work GitHub account

```bash
gitswitch setup
```

Example:

```text
Welcome to GitSwitch

? Profile name:
> work

Connect your GitHub account...

Enter code: ABCD-1234

Opening GitHub in your browser...

Waiting for GitHub authorization...
```

After authorization:

```text
✓ GitHub authentication successful
✓ Connected to GitHub as company-user
✓ SSH key generated
✓ SSH identity configured
✓ SSH key uploaded to GitHub
✓ SSH connection verified

GitSwitch setup complete
```

---

## 2. Connect another account

Run:

```bash
gitswitch setup
```

Create a second profile:

```text
Profile:
> personal

GitHub:
<https://github.com/yinklylab>

✓ Personal profile configured
```

---

## 3. View your profiles

```bash
gitswitch list
```

---

## 4. Clone a repository

```bash
gitswitch clone work https://github.com/company/api.git
```

---

## 5. Work normally

```bash
cd api

git add .
git commit -m "feat: add API"
```

---

## 6. Push with the selected identity

```bash
gitswitch push work
```

---

# Manual Setup

Advanced users and existing GitSwitch users can use the manual PAT-based setup flow.

Run:

```bash
gitswitch setup --manual
```

Manual setup supports:

* GitHub username entry
* Git author configuration
* Personal Access Token authentication
* Username verification
* Manual SSH key fallback
* Existing GitSwitch workflows

OAuth setup is the recommended default.

---

# Commands

| Command                               | Description                                        |
| ------------------------------------- | -------------------------------------------------- |
| `gitswitch setup`                     | Connect and configure a GitHub account using OAuth |
| `gitswitch setup --manual`            | Configure an account using the manual flow         |
| `gitswitch list`                      | View configured GitSwitch profiles                 |
| `gitswitch use <profile>`             | Switch the active GitSwitch profile                |
| `gitswitch current`                   | Show the current GitSwitch profile                 |
| `gitswitch clone <profile> <repo>`    | Clone a repository using a profile                 |
| `gitswitch remote <profile>`          | Update a repository remote identity                |
| `gitswitch push <profile> [branch]`   | Push using a selected profile                      |
| `gitswitch verify <username> [token]` | Verify GitHub credentials                          |
| `gitswitch doctor`                    | Run GitSwitch diagnostics                          |
| `gitswitch guide`                     | Show workflow help                                 |
| `gitswitch delete <profile>`          | Remove a GitSwitch profile                         |

---

# Security

GitSwitch is designed to keep GitHub credentials and SSH identities isolated.

GitSwitch:

* Uses GitHub OAuth Device Flow for default authentication
* Does not ask for your GitHub password
* Stores GitHub tokens using your operating system credential manager
* Does not store GitHub tokens in plain-text configuration files
* Keeps private SSH keys on your machine
* Uploads only SSH public keys to GitHub
* Creates isolated SSH identities for each profile
* Uses `IdentitiesOnly yes` to reduce SSH identity conflicts

Credential storage is handled by your operating system:

```text
macOS  → Keychain
Windows → Credential Manager
Linux  → Secret Service
```

---

# Git Already Supports Multiple Identities

Yes.

Git supports multiple configuration files.

SSH supports multiple identities.

GitHub provides authentication tooling.

GitSwitch does not replace these tools.

GitSwitch automates the repetitive setup required to connect them into a multi-account workflow.

Git and SSH provide the primitives.

**GitSwitch turns the setup into a guided developer experience.**

---

# Contributing

GitSwitch is open source.

Contributions, bug reports, and feature ideas are welcome.

If you already manage multiple GitHub identities using Git configuration, SSH aliases, shell scripts, or other tooling, your feedback is especially valuable.

---

# Author

**Oluyinka Abubakar**
Software Engineer, Developer Tool Builder & Open Source Enthusiast

GitHub: <https://github.com/lexico4real>
LinkedIn: <https://linkedin.com/in/oluyinka-abubakar>

---

# License

MIT License © 2026 Yinkly Lab
