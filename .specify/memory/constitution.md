<!--
Sync Impact Report:
Version change: 0.0.0 → 1.0.0
Modified principles: N/A (new constitution)
Added sections: Type Safety First, Documentation-Driven Development, Tech Stack Alignment, No Testing Policy
Removed sections: N/A (new constitution)
Templates requiring updates:
- ✅ plan-template.md (updated constitution check section)
- ✅ spec-template.md (updated testing requirements)
- ✅ tasks-template.md (removed testing phases)
- ⚠ pending: agent-file-template.md (needs Context7 MCP guidance)
Follow-up TODOs: None
-->

# Read It Later Constitution

## Core Principles

### I. Type Safety First (NON-NEGOTIABLE)

TypeScript type checking is the ONLY validation mechanism. All code MUST pass `tsc --noEmit` without errors. Type safety prevents runtime errors and serves as living documentation. No unit tests, integration tests, or end-to-end tests are permitted - types are the single source of truth for correctness.

### II. Documentation-Driven Development

Always use Context7 MCP to check documentation for unfamiliar tools or patterns. When reading docs, create a super short takeaway for memory to avoid re-reading. Documentation consultation MUST precede implementation of any new technology or pattern. This ensures best practices and prevents reinventing solutions.

### III. Tech Stack Alignment

Strictly follow the established T3 Stack: Next.js 15, React 19, TypeScript, Tailwind CSS, Drizzle ORM, tRPC, and BetterAuth. No deviations without explicit justification. All new features MUST integrate seamlessly with existing stack patterns and conventions.

### IV. No Testing Policy

Testing is explicitly prohibited except for type checking. No test files, test runners, or testing frameworks allowed. Type safety through TypeScript provides sufficient validation. Focus development time on implementation and type refinement rather than test maintenance.

### V. Simplicity and Clarity

Code MUST be readable and self-documenting. Prefer explicit over implicit, clear over clever. Complex solutions require justification. When in doubt, choose the simpler approach that maintains type safety and follows established patterns.

## Development Workflow

### Code Quality Gates

- TypeScript compilation MUST pass without errors
- ESLint rules MUST be followed (configured for T3 Stack)
- Prettier formatting MUST be applied
- All imports MUST be properly typed
- No `any` types without explicit justification

### Documentation Requirements

- Use Context7 MCP for all unfamiliar technologies
- Create memory notes for repeated patterns
- Document complex business logic with clear comments
- Maintain README with current setup instructions

### Technology Integration

- New dependencies MUST align with T3 Stack philosophy
- Database changes MUST use Drizzle ORM patterns
- API endpoints MUST use tRPC procedures
- UI components MUST use shadcn/ui patterns
- Authentication MUST use BetterAuth patterns
- Use Shadcn/ui patterns for all components

## Governance

This constitution supersedes all other development practices. Amendments require:

1. Clear justification for the change
2. Impact assessment on existing codebase
3. Update to all dependent templates
4. Migration plan if breaking changes

All code reviews MUST verify constitution compliance. Violations require immediate correction before merge approval.

**Version**: 1.0.0 | **Ratified**: 2025-01-27 | **Last Amended**: 2025-01-27
