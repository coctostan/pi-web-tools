Launch a new agent to handle complex, multi-step tasks autonomously.

The Agent tool launches specialized agents that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types:
Default agents:

Custom agents:
- general-purpose: General-purpose agent for complex, multi-step tasks
- Explore: Fast codebase exploration agent (read-only)
- Plan: Software architect for implementation planning (read-only)
- code-reviewer: Production readiness review: quality, security, testing (read-only)
- pals-implementer: Task-bounded implementation worker for parent-controlled PALS APPLY

Custom agents can be defined in .pi/agents/<name>.md (project) or /Users/maxwellnewman/.pi/agent/agents/<name>.md (global) — they are picked up automatically. Project-level agents override global ones. Creating a .md file with the same name as a default agent overrides it.

Guidelines:
- For parallel work, use run_in_background: true on each agent. Foreground calls run sequentially — only one executes at a time.
- Use Explore for codebase searches and code understanding.
- Use Plan for architecture and implementation planning.
- Use general-purpose for complex tasks that need file editing.
- Provide clear, detailed prompts so the agent can work autonomously.
- Agent results are returned as text — summarize them for the user.
- Use run_in_background for work you don't need immediately. You will be notified when it completes.
- Use resume with an agent ID to continue a previous agent's work.
- Use steer_subagent to send mid-run messages to a running background agent.
- Use model to specify a different model (as "provider/modelId", or fuzzy e.g. "haiku", "sonnet").
- Use thinking to control extended thinking level.
- Use inherit_context if the agent needs the parent conversation history.
- Use isolation: "worktree" to run the agent in an isolated git worktree (safe parallel file modifications).
- Use `schedule` only when the user explicitly asked for scheduled / recurring / delayed execution (e.g. "every Monday", "in an hour"). Don't auto-schedule from vague intent like "monitor X" — run once now or ask.