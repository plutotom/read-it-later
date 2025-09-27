# Data Model: Shadcn UI Integration

**Feature**: Shadcn UI Integration  
**Date**: 2025-01-27  
**Status**: Complete

## Entities

### Component

Represents a Shadcn UI component with its TypeScript types, styling, and configuration.

**Attributes**:

- `name: string` - Component name (e.g., "Button", "Input", "Card")
- `path: string` - File path relative to components directory
- `props: ComponentProps` - TypeScript interface for component props
- `variants: ComponentVariants` - Available component variants
- `defaultProps: Partial<ComponentProps>` - Default prop values
- `dependencies: string[]` - Required dependencies for the component

**Relationships**:

- Belongs to: ComponentLibrary
- Uses: Utility functions (cn, etc.)
- Extends: BaseComponent interface

### Configuration

Represents the components.json file that defines paths, aliases, and component settings.

**Attributes**:

- `$schema: string` - JSON schema reference
- `style: "default" | "new-york"` - Component style variant
- `rsc: boolean` - React Server Components support
- `tsx: boolean` - TypeScript support
- `tailwind: TailwindConfig` - Tailwind CSS configuration
- `aliases: Aliases` - Path aliases for imports
- `utils: UtilsConfig` - Utility function configuration

**Relationships**:

- Configures: All components in the library
- References: Tailwind configuration
- Defines: Import paths and aliases

### Utility

Represents helper functions like cn() for class merging and component utilities.

**Attributes**:

- `name: string` - Function name (e.g., "cn", "cva")
- `implementation: string` - Function implementation code
- `dependencies: string[]` - Required packages
- `types: TypeDefinition` - TypeScript type definitions
- `usage: UsageExample[]` - Usage examples and patterns

**Relationships**:

- Used by: All components
- Depends on: External packages (clsx, tailwind-merge, etc.)

### Theme

Represents the design system configuration including colors, spacing, and typography.

**Attributes**:

- `colors: ColorPalette` - Color definitions using CSS custom properties
- `spacing: SpacingScale` - Spacing scale for margins, padding, etc.
- `typography: TypographyConfig` - Font families, sizes, weights
- `breakpoints: BreakpointConfig` - Responsive breakpoints
- `shadows: ShadowConfig` - Box shadow definitions
- `borders: BorderConfig` - Border radius and width definitions

**Relationships**:

- Applied to: All components
- Extends: Tailwind CSS theme
- References: CSS custom properties

## Type Definitions

### ComponentProps

```typescript
interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}
```

### ComponentVariants

```typescript
interface ComponentVariants {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  [key: string]: string | undefined;
}
```

### TailwindConfig

```typescript
interface TailwindConfig {
  config: string;
  css: string;
  baseColor: string;
  cssVariables: boolean;
  prefix: string;
}
```

### Aliases

```typescript
interface Aliases {
  components: string;
  utils: string;
  ui: string;
  lib: string;
  hooks: string;
}
```

### UtilsConfig

```typescript
interface UtilsConfig {
  tailwindConfig: string;
  tailwindBaseColor: string;
  tailwindCss: string;
  tailwindPrefix: string;
  tailwindCssVariables: boolean;
}
```

## State Transitions

### Component Installation

1. **Initial State**: Component not installed
2. **Installation**: CLI command adds component files
3. **Configuration**: Component added to components.json
4. **Ready State**: Component available for use

### Theme Application

1. **Base Theme**: Default Shadcn UI theme applied
2. **Customization**: CSS variables modified
3. **Component Update**: Components reflect new theme
4. **Validation**: Theme consistency verified

## Validation Rules

### Component Validation

- Component name must be valid identifier
- Props interface must extend base ComponentProps
- Variants must be properly typed
- Dependencies must be installed

### Configuration Validation

- JSON schema must be valid
- Path aliases must resolve correctly
- Tailwind config must be compatible
- TypeScript paths must match aliases

### Theme Validation

- CSS custom properties must be defined
- Color values must be valid CSS colors
- Spacing values must be valid CSS units
- Typography must be properly configured

## Dependencies

### External Packages

- `class-variance-authority` - Component variant management
- `clsx` - Conditional class merging
- `tailwind-merge` - Tailwind CSS class merging
- `lucide-react` - Icon library

### Internal Dependencies

- Tailwind CSS configuration
- TypeScript path aliases
- Next.js app directory structure
- Existing component patterns
