# Tasks: Read It Later App

**Input**: Design documents from `/specs/001-read-it-later/`
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
- [ ] T002 Initialize Next.js project with T3 Stack dependencies
- [ ] T003 [P] Configure linting and formatting tools

## Phase 3.2: Types First (Type-First Development) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These type definitions MUST be written before ANY implementation**

- [ ] T004 [P] Article type definitions in src/types/article.ts
- [ ] T005 [P] Folder type definitions in src/types/folder.ts
- [ ] T006 [P] Highlight and note type definitions in src/types/annotation.ts
- [ ] T007 [P] API request/response types in src/types/api.ts
- [ ] T008 [P] Zod validation schemas in src/schemas/article.ts
- [ ] T009 [P] Zod validation schemas in src/schemas/folder.ts
- [ ] T010 [P] Zod validation schemas in src/schemas/annotation.ts

## Phase 3.3: Database Schema (ONLY after types are defined)

- [ ] T011 [P] Article table schema in src/server/db/schema.ts
- [ ] T012 [P] Folder table schema in src/server/db/schema.ts
- [ ] T013 [P] Highlight table schema in src/server/db/schema.ts
- [ ] T014 [P] Note table schema in src/server/db/schema.ts
- [ ] T015 [P] Database relations in src/server/db/schema.ts
- [ ] T016 Run database migration with Drizzle

## Phase 3.4: tRPC API Implementation

- [ ] T017 [P] Article router in src/server/api/routers/article.ts
- [ ] T018 [P] Folder router in src/server/api/routers/folder.ts
- [ ] T019 [P] Annotation router in src/server/api/routers/annotation.ts
- [ ] T020 Update root router in src/server/api/root.ts
- [ ] T021 [P] Article extraction service in src/server/services/articleExtractor.ts
- [ ] T022 [P] Search service in src/server/services/searchService.ts

## Phase 3.5: Mobile-First UI Components

- [ ] T023 [P] Article list component in src/app/\_components/article-list.tsx
- [ ] T024 [P] Article card component in src/app/\_components/article-card.tsx
- [ ] T025 [P] Article reader component in src/app/\_components/article-reader.tsx
- [ ] T026 [P] Folder sidebar component in src/app/\_components/folder-sidebar.tsx
- [ ] T027 [P] Search bar component in src/app/\_components/search-bar.tsx
- [ ] T028 [P] Add article form component in src/app/\_components/add-article-form.tsx
- [ ] T029 [P] Highlight annotation component in src/app/\_components/highlight-annotation.tsx

## Phase 3.6: Pages and Layout

- [ ] T030 Mobile-first responsive layout in src/app/layout.tsx
- [ ] T031 Main dashboard page in src/app/page.tsx
- [ ] T032 Article detail page in src/app/article/[id]/page.tsx
- [ ] T033 Folder view page in src/app/folder/[id]/page.tsx
- [ ] T034 Search results page in src/app/search/page.tsx

## Phase 3.7: Integration

- [ ] T035 Connect tRPC client in src/trpc/react.tsx
- [ ] T036 [P] Error handling middleware
- [ ] T037 [P] Request/response logging
- [ ] T038 [P] Mobile viewport optimization

## Phase 3.8: Polish

- [ ] T039 [P] Type refinement and validation improvements
- [ ] T040 Performance optimization (<200ms mobile load)
- [ ] T041 [P] Update README.md with setup instructions
- [ ] T042 Remove duplication and dead code
- [ ] T043 Run type checking with `tsc --noEmit`

## Dependencies

- Types (T004-T010) before database schema (T011-T016)
- Database schema (T011-T016) before API implementation (T017-T022)
- API implementation (T017-T022) before UI components (T023-T029)
- UI components (T023-T029) before pages (T030-T034)
- All implementation before polish (T039-T043)

## Parallel Example

```
# Launch T004-T010 together:
Task: "Article type definitions in src/types/article.ts"
Task: "Folder type definitions in src/types/folder.ts"
Task: "Highlight and note type definitions in src/types/annotation.ts"
Task: "API request/response types in src/types/api.ts"
Task: "Zod validation schemas in src/schemas/article.ts"
Task: "Zod validation schemas in src/schemas/folder.ts"
Task: "Zod validation schemas in src/schemas/annotation.ts"
```

## Notes

- [P] tasks = different files, no dependencies
- Verify types compile before implementing
- Commit after each task
- Avoid: vague tasks, same file conflicts
- Mobile-first design throughout
- Type safety is the only validation mechanism

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
   - Setup → Types → Database → API → UI → Pages → Integration → Polish
   - Dependencies block parallel execution

## Validation Checklist

_GATE: Checked by main() before returning_

- [x] All contracts have corresponding type definitions
- [x] All entities have model tasks
- [x] All types come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
