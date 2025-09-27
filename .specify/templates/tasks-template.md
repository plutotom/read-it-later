# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → type definition task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Types: type definitions, validation schemas
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: performance, docs, type refinement
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Types before implementation (Type-First Development)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have type definitions?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 3.1: Setup

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools

## Phase 3.2: Types First (Type-First Development) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These type definitions MUST be written before ANY implementation**

- [ ] T004 [P] Type definitions for POST /api/users in src/types/api.ts
- [ ] T005 [P] Type definitions for GET /api/users/{id} in src/types/api.ts
- [ ] T006 [P] Zod validation schemas in src/schemas/user.ts
- [ ] T007 [P] Type definitions for auth flow in src/types/auth.ts

## Phase 3.3: Core Implementation (ONLY after types are defined)

- [ ] T008 [P] User model in src/models/user.py
- [ ] T009 [P] UserService CRUD in src/services/user_service.py
- [ ] T010 [P] CLI --create-user in src/cli/user_commands.py
- [ ] T011 POST /api/users endpoint
- [ ] T012 GET /api/users/{id} endpoint
- [ ] T013 Input validation
- [ ] T014 Error handling and logging

## Phase 3.4: Integration

- [ ] T015 Connect UserService to DB
- [ ] T016 Auth middleware
- [ ] T017 Request/response logging
- [ ] T018 CORS and security headers

## Phase 3.5: Polish

- [ ] T019 [P] Type refinement and validation improvements
- [ ] T020 Performance optimization (<200ms)
- [ ] T021 [P] Update docs/api.md
- [ ] T022 Remove duplication
- [ ] T023 Run type checking and validation

## Dependencies

- Types (T004-T007) before implementation (T008-T014)
- T008 blocks T009, T015
- T016 blocks T018
- Implementation before polish (T019-T023)

## Parallel Example

```
# Launch T004-T007 together:
Task: "Type definitions for POST /api/users in src/types/api.ts"
Task: "Type definitions for GET /api/users/{id} in src/types/api.ts"
Task: "Zod validation schemas in src/schemas/user.ts"
Task: "Type definitions for auth flow in src/types/auth.ts"
```

## Notes

- [P] tasks = different files, no dependencies
- Verify types compile before implementing
- Commit after each task
- Avoid: vague tasks, same file conflicts

## Task Generation Rules

_Applied during main() execution_

1. **From Contracts**:
   - Each contract file → type definition task [P]
   - Each endpoint → implementation task
2. **From Data Model**:
   - Each entity → model creation task [P]
   - Relationships → service layer tasks
3. **From User Stories**:
   - Each story → type validation task [P]
   - Quickstart scenarios → validation tasks

4. **Ordering**:
   - Setup → Types → Models → Services → Endpoints → Polish
   - Dependencies block parallel execution

## Validation Checklist

_GATE: Checked by main() before returning_

- [ ] All contracts have corresponding type definitions
- [ ] All entities have model tasks
- [ ] All types come before implementation
- [ ] Parallel tasks truly independent
- [ ] Each task specifies exact file path
- [ ] No task modifies same file as another [P] task
