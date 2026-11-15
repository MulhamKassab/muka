export type SubAgentStatus = 'running' | 'done' | 'failed' | 'stopped'

/** Token counts the API reported, summed over an agent's turns. */
export type Usage = {
  /** Input read fresh: neither from nor into the prompt cache. */
  input: number
  output: number
  /** Input the prompt cache served. */
  cacheRead: number
  /** Input written to the prompt cache. */
  cacheWrite: number
}

/** One tool call an agent made: the tool and a short label for what it did. */
export type Step = {
  /** The call's tool_use_id, to mark its outcome when it returns. */
  id?: string
  tool: string
  label: string
  at: number
  outcome?: 'denied' | 'error'
}

export type SubAgent = {
  id: string
  /** The agent that started this one; absent when the main agent did. */
  parentId?: string
  type: string
  description: string
  model: string
  status: SubAgentStatus
  startedAt: number
  endedAt?: number
  /** The last few steps, oldest first; the last one is the current step. */
  steps: Step[]
  /** Steps that ran (denied ones are not counted). */
  stepCount: number
  usage?: Usage
}

export type MainInfo = {
  model?: string
  ctxPercent?: number
  ctxTokens?: number
  ctxWindow?: number
  /** The main agent's step in progress, or its last one this prompt. */
  current?: Step
  /** Whether the main agent is working on a prompt now. */
  isWorking?: boolean
  /** Steps the main agent took since your last prompt. */
  stepCount?: number
  /** The main agent's last turn's token counts. */
  usage?: Usage
  /** The usage-limit windows the last response reported. */
  limits?: LimitReading[]
  /** What the session has cost so far, exact, in US dollars (API prices). */
  costUsd?: number
  /** Estimated spend so far this session by model family (fable, opus, sonnet, haiku). */
  spendByModel?: Record<string, number>
  /** When the main agent started and finished the current prompt. */
  turnStartedAt?: number
  turnEndedAt?: number
  /** The first words of the current prompt, for the recap log. */
  prompt?: string
  /** The main agent's task list (its checklist), as it last stood. */
  plan?: PlanItem[]
  /** The session cost when the current prompt started, to measure its spend. */
  promptCostStart?: number
  /** This prompt's budget in dollars, read from a PLAN.md "Budget: $N" line. */
  promptBudget?: number
  /** How far into the budget the warnings have gone: 0, 70 or 100. */
  budgetStage?: number
}

/** One item of the main agent's task list. */
export type PlanItem = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** One usage-limit window: `five_hour`, `seven_day` or `spend_limit`. */
export type LimitReading = {
  kind: string
  percent: number
  resetsAt?: string
}

/** One change to a file, as hunks a diff view can draw. */
export type FileEdit = {
  at: number
  agent: string
  tool: string
  /** Unified-diff hunks (with `@@` headers), capped. */
  diff: string
  isCut?: boolean
}

/** One finished prompt, kept for the daily recap. */
export type LogEntry = {
  at: number
  project: string
  prompt: string
  durationMs: number
  mainSteps: number
  agents: number
  failed: number
  files: string[]
  tokens: number
  costUsd?: number
}

export type NoticeKind =
  | 'failed'
  | 'denied'
  | 'error'
  | 'risky'
  | 'outside'
  | 'delete-confirmed'
  | 'delete-blocked'
  | 'delete-unasked'
  | 'cost'

/** One thing you should know about: a failure, a risky command, a delete. */
export type Notice = {
  id: string
  kind: NoticeKind
  /** Which agent: "Main" or the subagent's type. */
  agent: string
  text: string
  at: number
}

/** A file an agent changed since your last prompt. */
export type FileChange = {
  path: string
  agents: string[]
  count: number
  at: number
  /** The last few changes, newest last. */
  edits?: FileEdit[]
}

/** One step in the activity feed: which agent took it. */
export type ActivityItem = Step & {
  agentId?: string
  agent: string
}

/** A note you send an agent from the Steer tab, read at its next step. */
export type SteerNote = {
  id: string
  text: string
  /** 'main', or a subagent's id. */
  to: string
  /** Who it was for, as shown. */
  toLabel: string
  at: number
  deliveredAt?: number
}

export type SavvyView = 'flow' | 'steer' | 'activity' | 'timeline' | 'cost' | 'cache' | 'radius' | 'notes' | 'reflect'

/** The stats recap of the main agent's last finished turn. */
export type Recap = {
  at: number
  durationMs: number
  mainSteps: number
  agents: number
  agentSteps: number
  failed: number
  tokens: number
  /** Share of the last turn's input the cache served, 0-100. */
  cacheRate?: number
  filesChanged: number
  notices: number
}

export type Reflection = {
  recap?: Recap
  review?: string
  reviewAt?: number
  isBusy?: boolean
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    muka: {
      agents: Shaped<SubAgent[]>
      main: Shaped<MainInfo>
      notices: Shaped<Notice[]>
      changes: Shaped<FileChange[]>
      view: Shaped<SavvyView>
      reflection: Shaped<Reflection>
      /** The file whose changes the Blast radius tab shows; '' for none. */
      selected: Shaped<string>
      /** Every agent's steps this prompt, oldest first. */
      activity: Shaped<ActivityItem[]>
      /** The agent whose detail view is open; '' for none. */
      focus: Shaped<string>
      /** Bumped every 30 seconds while agents work, so times and alerts stay current. */
      tick: Shaped<number>
      /** The Activity tab's filter: an agent or tool name; '' for all. */
      feedFilter: Shaped<string>
      /** Notes sent from the Steer tab, newest last. */
      steer: Shaped<SteerNote[]>
      /** Who the next steer note goes to: 'main' or a subagent's id. */
      steerTo: Shaped<string>
    }
  }
}
