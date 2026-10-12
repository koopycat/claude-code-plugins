import type { EngineInterface, Register } from 'claude-code'

export type Checkout = {
  top: string
  gitDir: string
  commonDir: string
  // Empty while HEAD is detached.
  branch: string
  commit: string
}

const base = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

// The common dir of a normal clone is <repo>/.git; a bare one or a submodule's
// is named after the repository itself.
export const repoName = (commonDir: string): string => {
  const trimmed = commonDir.replace(/\/+$/, '')
  return base(base(trimmed) === '.git' ? trimmed.slice(0, -'/.git'.length) : trimmed.replace(/\.git$/, ''))
}

// A linked worktree keeps its own git dir apart from the repository's common one.
export const label = ({ top, gitDir, commonDir, branch, commit }: Checkout): string => {
  const parts = [repoName(commonDir), branch === '' ? `detached ${commit}` : branch]
  if (gitDir !== commonDir) parts.push(`worktree ${base(top)}`)
  return parts.join(' · ')
}

const git = async ($: EngineInterface, cwd: string | undefined, ...args: string[]) => {
  const { exitCode, stdout, stderr } = await $.process.run(['git', ...args], cwd === undefined ? undefined : { cwd })
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

const NOT_A_CHECKOUT = /not a git repository|must be run in a work tree/

// undefined outside a repository and in a bare one; anything else git refuses
// is an error, never a quietly empty line.
export const locate = async ($: EngineInterface, cwd?: string): Promise<Checkout | undefined> => {
  const paths = await git($, cwd, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir')
  if (paths.exitCode !== 0) {
    if (NOT_A_CHECKOUT.test(paths.stderr)) return undefined
    throw new Error(`git rev-parse failed: ${paths.stderr}`)
  }
  const [top, gitDir, commonDir] = paths.stdout.split('\n')
  if (top === undefined || gitDir === undefined || commonDir === undefined) {
    throw new Error(`git rev-parse answered ${JSON.stringify(paths.stdout)}`)
  }

  const branch = await git($, cwd, 'branch', '--show-current')
  if (branch.exitCode !== 0) throw new Error(`git branch failed: ${branch.stderr}`)
  if (branch.stdout !== '') return { top, gitDir, commonDir, branch: branch.stdout, commit: '' }

  const commit = await git($, cwd, 'rev-parse', '--short', 'HEAD')
  if (commit.exitCode !== 0) throw new Error(`git rev-parse HEAD failed: ${commit.stderr}`)
  return { top, gitDir, commonDir, branch: '', commit: commit.stdout }
}

let latest = 0

const refresh = async ($: EngineInterface, cwd?: string) => {
  const mine = (latest += 1)
  const checkout = await locate($, cwd)
  // A slower, older refresh must not overwrite a newer one.
  if (mine === latest) $.ui.status(checkout === undefined ? undefined : label(checkout))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($, e.cwd)
    return started
  }).catch(($, e, next) => next(e))

  // cd, EnterWorktree and ExitWorktree move the session.
  on('classic.CwdChanged', async ($, e, next) => {
    const changed = await next(e)
    await refresh($, e.new_cwd)
    return changed
  }).catch(($, e, next) => next(e))

  // git checkout, switch and worktree commands run through Bash.
  on('tool.call', { tool: ['Bash', 'EnterWorktree', 'ExitWorktree'] }, async ($, e, next) => {
    const ran = await next(e)
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // Catches a branch switched outside the session while it sat idle.
  on('prompt.submit', async ($, e, next) => {
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))
}
