import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { label, repoName } from '../hooks/register'

type Repo = { top: string; gitDir: string; commonDir: string; branch: string; commit?: string }

const MAIN: Repo = {
  top: '/Users/vk/src/starter/claude_mods',
  gitDir: '/Users/vk/src/starter/claude_mods/.git',
  commonDir: '/Users/vk/src/starter/claude_mods/.git',
  branch: 'main',
}

const LINKED: Repo = {
  top: '/Users/vk/worktrees/claude_mods/exp/branch-line',
  gitDir: '/Users/vk/src/starter/claude_mods/.git/worktrees/branch-line',
  commonDir: '/Users/vk/src/starter/claude_mods/.git',
  branch: 'exp/branch-line',
}

const done = { isStdoutTruncated: false, isStderrTruncated: false }
const ok = (stdout: string) => ({ exitCode: 0, stdout: `${stdout}\n`, stderr: '', ...done })
const fatal = (stderr: string) => ({ exitCode: 128, stdout: '', stderr, ...done })

// Stands in for git: `answer` returns the repository a directory belongs to,
// and `calls` records the directory each git command ran in.
const fakeGit = (on: On, answer: (cwd: string | undefined) => Repo | string | undefined) => {
  const calls: (string | undefined)[] = []
  on('process.run', ($, e) => {
    const cwd = e.init?.cwd
    calls.push(cwd)
    // Git must speak English, since its errors are told apart by their text.
    expect(e.init?.env).toEqual({ LC_ALL: 'C' })
    expect(e.init?.timeoutMs).toBeGreaterThan(0)
    const repo = answer(cwd)
    if (typeof repo === 'string') return { value: fatal(repo) }
    if (repo === undefined) return { value: fatal('fatal: not a git repository (or any of the parent directories): .git') }
    const [, sub = ''] = e.argv
    if (sub === 'branch') return { value: ok(repo.branch) }
    if (e.argv.includes('HEAD')) return { value: ok(repo.commit ?? '') }
    return { value: ok([repo.top, repo.gitDir, repo.commonDir].join('\n')) }
  })
  return calls
}

// Every status line the plugin pinned, in order; undefined is a cleared line.
const statuses = (on: On) => {
  const lines: (string | undefined)[] = []
  on('ui.status', ($, e) => {
    lines.push(e.text)
    return { value: undefined }
  })
  return lines
}

const start = async ($: Engine, on: On, cwd = MAIN.top) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
}

// A prompt as the person types it at the composer.
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

describe('label', () => {
  test('names the repository after its checkout, not its worktree folder', () => {
    expect(repoName('/Users/vk/src/starter/claude_mods/.git')).toBe('claude_mods')
    expect(repoName('/Users/vk/src/starter/claude_mods/.git/')).toBe('claude_mods')
    expect(repoName('/srv/git/claude_mods.git')).toBe('claude_mods')
    expect(repoName('/Users/vk/src/app/.git/modules/lib')).toBe('lib')
  })

  test('branch of the main checkout', () => {
    expect(label({ ...MAIN, commit: '' })).toBe('claude_mods · main')
  })

  test('branch and folder of a linked worktree', () => {
    expect(label({ ...LINKED, commit: '' })).toBe('claude_mods · exp/branch-line · worktree branch-line')
  })

  test('commit of a detached HEAD', () => {
    expect(label({ ...MAIN, branch: '', commit: '02cbdf4' })).toBe('claude_mods · detached 02cbdf4')
  })
})

describe('status line', () => {
  test('shows the branch when the session starts', async ($, on) => {
    fakeGit(on, () => MAIN)
    const lines = statuses(on)

    await start($, on)

    expect(lines).toEqual(['claude_mods · main'])
  })

  test('shows the linked worktree', async ($, on) => {
    fakeGit(on, () => LINKED)
    const lines = statuses(on)

    await start($, on, LINKED.top)

    expect(lines).toEqual(['claude_mods · exp/branch-line · worktree branch-line'])
  })

  test('shows the commit while HEAD is detached', async ($, on) => {
    fakeGit(on, () => ({ ...MAIN, branch: '', commit: '02cbdf4' }))
    const lines = statuses(on)

    await start($, on)

    expect(lines).toEqual(['claude_mods · detached 02cbdf4'])
  })

  test('clears the line outside a repository', async ($, on) => {
    fakeGit(on, () => undefined)
    const lines = statuses(on)

    await start($, on, '/tmp')

    expect(lines).toEqual([undefined])
  })

  test('clears the line in a bare repository', async ($, on) => {
    fakeGit(on, () => 'fatal: this operation must be run in a work tree')
    const lines = statuses(on)

    await start($, on, '/srv/git/claude_mods.git')

    expect(lines).toEqual([undefined])
  })
})

describe('refresh', () => {
  test('after a Bash command, such as git switch', async ($, on) => {
    let repo = MAIN
    fakeGit(on, () => repo)
    const lines = statuses(on)
    on('tool.call', () => {
      repo = { ...MAIN, branch: 'fix/typo' }
      return { deny: 'not run in tests' }
    })

    await $.tool.call({ tool: 'Bash', command: 'git switch fix/typo' })

    expect(lines).toEqual(['claude_mods · fix/typo'])
  })

  test('after the session moves into another directory', async ($, on) => {
    const calls = fakeGit(on, cwd => (cwd === LINKED.top ? LINKED : MAIN))
    const lines = statuses(on)
    on('classic.CwdChanged', () => ({}))

    await $.classic.CwdChanged({ old_cwd: MAIN.top, new_cwd: LINKED.top })

    expect(lines).toEqual(['claude_mods · exp/branch-line · worktree branch-line'])
    expect(new Set(calls)).toEqual(new Set([LINKED.top]))
  })

  test('before a prompt, for a branch switched outside the session', async ($, on) => {
    fakeGit(on, () => ({ ...MAIN, branch: 'outside' }))
    const lines = statuses(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))

    await $.prompt.submit(typed('hello'))

    expect(lines).toEqual(['claude_mods · outside'])
  })

  test('not after other tools', async ($, on) => {
    const calls = fakeGit(on, () => MAIN)
    on('tool.call', () => ({ deny: 'not run in tests' }))

    await $.tool.call({ tool: 'Read', file_path: '/etc/hosts' })

    expect(calls).toEqual([])
  })

  test('keeps the newest answer when an older refresh finishes last', async ($, on) => {
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    let branches = 0
    const paths = [MAIN.top, MAIN.gitDir, MAIN.commonDir].join('\n')
    on('process.run', async ($, e) => {
      if (e.argv[1] !== 'branch') return { value: ok(paths) }
      branches += 1
      if (branches > 1) return { value: ok('newer') }
      await held
      return { value: ok('older') }
    })
    const lines = statuses(on)
    on('tool.call', () => ({ deny: 'not run in tests' }))

    const older = $.tool.call({ tool: 'Bash', command: 'git switch older' })
    await $.tool.call({ tool: 'Bash', command: 'git switch newer' })
    release()
    await older

    expect(lines).toEqual(['claude_mods · newer'])
  })
})

describe('failure', () => {
  test('a git error never changes what a tool call did, nor runs it again', async ($, on) => {
    fakeGit(on, () => 'fatal: detected dubious ownership in repository')
    const lines = statuses(on)
    let runs = 0
    on('tool.call', () => {
      runs += 1
      return { deny: 'not run in tests' }
    })

    const ran = await $.tool.call({ tool: 'Bash', command: 'true' })

    expect(ran).toMatchObject({ deny: 'not run in tests' })
    expect(runs).toBe(1)
    expect(lines).toEqual([])
  })

  test('an older refresh still writes when the newer one failed', async ($, on) => {
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    let rootCalls = 0
    const paths = [MAIN.top, MAIN.gitDir, MAIN.commonDir].join('\n')
    on('process.run', async ($, e) => {
      if (e.argv[1] === 'rev-parse') {
        rootCalls += 1
        if (rootCalls > 1) return { value: fatal('fatal: detected dubious ownership in repository') }
        return { value: ok(paths) }
      }
      await held
      return { value: ok('older') }
    })
    const lines = statuses(on)
    on('tool.call', () => ({ deny: 'not run in tests' }))

    const older = $.tool.call({ tool: 'Bash', command: 'git switch older' })
    await $.tool.call({ tool: 'Bash', command: 'true' })
    release()
    await older

    expect(lines).toEqual(['claude_mods · older'])
  })

  test('a missing git never blocks a prompt', async ($, on) => {
    on('process.run', () => {
      throw new Error('spawn git ENOENT')
    })
    on('prompt.submit', ($, e) => ({ text: e.text }))

    await expect($.prompt.submit(typed('hello'))).resolves.toMatchObject({ text: 'hello' })
  })
})
