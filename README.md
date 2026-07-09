# GitSwitch — Effortless Multi-GitHub Account Workflow Manager (by Yinkly)

**GitSwitch** is a powerful developer-focused CLI built with NestJS that helps developers manage multiple GitHub accounts and automate Git workflows on a single machine.

Whether you work across personal projects, company repositories, freelance clients, or open-source contributions — GitSwitch helps you switch identities, clone repositories, configure remotes, and push code using the correct GitHub account.

No more SSH confusion.
No more wrong-account commits.
No more GitHub identity headaches.

---

## ✨ Features

### 👥 Account Management

* Manage multiple GitHub accounts (personal, work, client, etc.)
* Interactive account setup wizard
* Automatic `.gitconfig` management
* Automatic SSH key generation and configuration
* Secure GitHub token storage using OS credential storage
* GitHub username and token verification
* Safe account removal

### 🚀 Git Workflow Automation

* Clone repositories with a selected GitHub account
* Supports HTTPS and SSH GitHub clone URLs
* Automatically converts repository URLs to account-specific SSH aliases
* Switch repository remotes between GitHub identities
* Push code using a specific GitHub account
* Interactive branch selection during push
* Direct branch push support

### 🛠 Developer Tools

* View current GitSwitch profile
* Detect active repository, branch, and remote
* Built-in workflow guide
* Environment diagnostics with GitSwitch Doctor
* Cross-platform support
* Config locking to prevent corruption

---

## 🖥 Supported Platforms

* Windows
* macOS
* Linux

Requirements:

* Node.js 18+
* Git
* SSH

---

## 📦 Installation

Install globally with npm:

```bash
npm install -g @yinklylab.dev/gitswitch
```

Or with Yarn:

```bash
yarn global add @yinklylab.dev/gitswitch
```

Verify installation:

```bash
gitswitch -v
```

---

# 🚀 Quick Start

## Setup a GitHub Account

```bash
gitswitch setup
```

GitSwitch will:

* Configure Git username and email
* Generate SSH keys
* Update SSH configuration
* Save account metadata
* Verify GitHub credentials

---

## List Accounts

```bash
gitswitch list
```

Example:

```text
Configured Accounts

✓ personal
✓ work
✓ client
```

---

## Switch Active Git Account

```bash
gitswitch use <account>
```

Example:

```bash
gitswitch use personal
```

GitSwitch automatically updates your active Git identity.

---

# Repository Workflow

## Clone Repository with an Account

Instead of manually configuring SSH:

```bash
git clone git@github-work:user/project.git
```

Use:

```bash
gitswitch clone work https://github.com/user/project.git
```

GitSwitch converts:

```text
https://github.com/user/project.git

↓

git@github-work:user/project.git
```

SSH URLs work too:

```bash
gitswitch clone work git@github.com:user/project.git
```

---

## Change Repository GitHub Account

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

---

## Push Using an Account

Interactive mode:

```bash
gitswitch push work
```

Example:

```text
Using account: work

Current branch:
feature/payment

Push where?

❯ Current branch
  Different branch
```

Direct branch push:

```bash
gitswitch push work main
```

---

## Current Profile

Check your active GitSwitch environment:

```bash
gitswitch current
```

Example:

```text
👤 Active GitSwitch Profile

Account: work

Email: developer@company.com

SSH: github-work

Repository: payment-api

Branch: main

Remote:
git@github-work:company/payment-api.git
```

---

# 🩺 GitSwitch Doctor

Run diagnostics:

```bash
gitswitch doctor
```

Checks:

```text
GitSwitch Health Check

✓ Git installed
✓ SSH installed
✓ GitHub reachable
✓ Account configuration exists
✓ SSH keys exist
✓ Repository detected
✓ Remote configured

Everything looks good 🚀
```

---

# 📖 Workflow Guide

View GitSwitch usage instructions anytime:

```bash
gitswitch guide
```

---

# Commands

| Command                            | Description                       |
| ---------------------------------- | --------------------------------- |
| `gitswitch setup`                  | Configure a GitHub account        |
| `gitswitch list`                   | View configured accounts          |
| `gitswitch use <account>`          | Switch active Git identity        |
| `gitswitch current`                | Show current profile              |
| `gitswitch clone <account> <repo>` | Clone repository with an account  |
| `gitswitch remote <account>`       | Switch repository remote identity |
| `gitswitch push <account>`         | Push using selected account       |
| `gitswitch verify <username>`      | Verify GitHub credentials         |
| `gitswitch doctor`                 | Run diagnostics                   |
| `gitswitch guide`                  | Show workflow help                |
| `gitswitch delete <account>`       | Remove an account                 |

---

# Example Workflow

```bash
# Setup your accounts
gitswitch setup

# View accounts
gitswitch list

# Clone repository
gitswitch clone work https://github.com/company/api.git

# Check environment
gitswitch current

# Make changes
git add .

git commit -m "feat: add API"

# Push safely
gitswitch push work
```

---

# 🔐 Security

GitSwitch:

* Stores tokens using your operating system credential manager
* Does not save plain-text GitHub tokens
* Creates isolated SSH identities
* Keeps account configurations separated

---

# Troubleshooting

Run:

```bash
gitswitch doctor
```

to diagnose:

* SSH issues
* Missing keys
* Remote problems
* Account configuration errors

---

# Author

**Oluyinka Abubakar**
Developer, Innovator & Open Source Enthusiast

GitHub: https://github.com/lexico4real
LinkedIn: https://linkedin.com/in/oluyinka-abubakar

---

# License

MIT License © 2026 Yinkly Lab
