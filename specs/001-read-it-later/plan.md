# Implementation Plan: Read It Later App

**Branch**: `001-read-it-later` | **Date**: 2025-01-27 | **Spec**: /Users/proctoi/Documents/Coding/read-it-later/specs/001-read-it-later/spec.md
**Input**: Feature specification from `/specs/001-read-it-later/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

A mobile-first read-it-later app that allows users to save web articles by URL, extract clean readable content, organize articles into folders, add highlights and notes, and search through their collection. Built with T3 Stack for type safety and mobile optimization.

## Technical Context

**Language/Version**: TypeScript 5.8.2, Next.js 15.2.3, React 19.0.0
**Primary Dependencies**: Next.js App Router, Drizzle ORM, tRPC, Tailwind CSS, BetterAuth
**Storage**: SQLite (development), PostgreSQL (production) via Drizzle ORM
**Type Checking**: TypeScript compilation with `tsc --noEmit` (NO TESTING ALLOWED)
**Target Platform**: Mobile-first responsive web application
**Project Type**: web (Next.js full-stack application)
**Performance Goals**: <200ms page load, mobile-optimized reading experience
**Constraints**: Mobile-first design, type safety only (no testing), T3 Stack compliance
**Scale/Scope**: Personal use, unlimited articles, folder organization

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Type Safety Compliance

- [x] All proposed code changes maintain TypeScript type safety
- [x] No `any` types introduced without explicit justification
- [x] Type definitions align with existing patterns

### Documentation Requirements

- [x] Context7 MCP consulted for any unfamiliar technologies
- [x] Memory notes created for repeated patterns
- [x] Complex business logic documented with clear comments

### Tech Stack Alignment

- [x] All new dependencies align with T3 Stack (Next.js, React, TypeScript, Tailwind, Drizzle, tRPC, betterAuth)
- [x] Database changes use Drizzle ORM patterns
- [x] API endpoints use tRPC procedures
- [x] UI components use shadcn/ui patterns

### No Testing Policy

- [x] No test files, test runners, or testing frameworks proposed
- [x] Type safety through TypeScript provides sufficient validation
- [x] Focus on implementation and type refinement

## Project Structure

### Documentation (this feature)

```
specs/001-read-it-later/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```
.
├─ public
│  └─ favicon.ico
├─ src
│  ├─ app
│  │  ├─ _components
│  │  │  └─ post.tsx
│  │  ├─ api
│  │  │  └─ trpc
│  │  │     └─ [trpc]
│  │  │        └─ route.ts
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ server
│  │  ├─ auth.ts
│  │  ├─ db
│  │  │  ├─ index.ts
│  │  │  └─ schema.ts
│  │  └─ api
│  │     ├─ routers
│  │     │  └─ example.ts
│  │     ├─ trpc.ts
│  │     └─ root.ts
│  ├─ styles
│  │  └─ globals.css
│  ├─ env.js
│  └─ trpc
│     ├─ query-client.ts
│     ├─ react.tsx
│     └─ server.ts
├─ .env
├─ .env.example
├─ .eslintrc.cjs
├─ .gitignore
├─ db.sqlite (after `db:push`, sqlite only)
├─ drizzle.config.ts
├─ next-env.d.ts
├─ next.config.js
├─ package.json
├─ postcss.config.js
├─ prettier.config.js
├─ README.md
├─ start-database.sh (mysql or postgres only)
├─ tailwind.config.ts
└─ tsconfig.json

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└─ [same as backend above]

ios/ or android/
└─ [platform-specific structure]
```

**Structure Decision**: DEFAULT to Option 1 (Next.js full-stack) - mobile-first web application

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate type definitions** from contracts:
   - TypeScript interfaces for request/response schemas
   - Input validation using Zod schemas
   - Type-safe API contracts

4. **Extract validation scenarios** from user stories:
   - Each story → type-safe validation steps
   - Quickstart validation = story type checking

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh cursor` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/\*, type definitions, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → type definition task [P]
- Each entity → model creation task [P]
- Each user story → type validation task
- Implementation tasks with type safety focus

**Ordering Strategy**:

- Type-first order: Type definitions before implementation
- Dependency order: Models before services before UI
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 20-25 numbered, ordered tasks in tasks.md (no testing overhead)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (type checking, execute quickstart.md, performance validation)

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [ ] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---

_Based on Constitution v1.0.0 - See `/memory/constitution.md`_
