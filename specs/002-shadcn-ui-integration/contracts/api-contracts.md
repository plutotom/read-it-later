# API Contracts: Shadcn UI Integration

**Feature**: Shadcn UI Integration  
**Date**: 2025-01-27  
**Status**: Complete

## Component Installation Contract

### Install Component

**Endpoint**: CLI Command  
**Method**: `npx shadcn@latest add <component-name>`

**Request**:

```typescript
interface InstallComponentRequest {
  componentName: string;
  options?: {
    force?: boolean;
    cwd?: string;
  };
}
```

**Response**:

```typescript
interface InstallComponentResponse {
  success: boolean;
  componentPath: string;
  filesCreated: string[];
  dependencies?: string[];
  error?: string;
}
```

**Validation**:

- Component name must be valid Shadcn UI component
- Target directory must exist and be writable
- No conflicting files should exist (unless force option used)

## Configuration Contract

### Update Configuration

**Endpoint**: File System  
**Method**: Update `components.json`

**Request**:

```typescript
interface UpdateConfigRequest {
  style?: "default" | "new-york";
  rsc?: boolean;
  tsx?: boolean;
  tailwind?: TailwindConfig;
  aliases?: Aliases;
  utils?: UtilsConfig;
}
```

**Response**:

```typescript
interface UpdateConfigResponse {
  success: boolean;
  configPath: string;
  updatedFields: string[];
  error?: string;
}
```

**Validation**:

- JSON schema must be valid
- All required fields must be present
- Path aliases must resolve correctly

## Type Definition Contract

### Generate Component Types

**Endpoint**: TypeScript Compiler  
**Method**: Type generation from component files

**Request**:

```typescript
interface GenerateTypesRequest {
  componentPath: string;
  includeVariants?: boolean;
  includeProps?: boolean;
}
```

**Response**:

```typescript
interface GenerateTypesResponse {
  success: boolean;
  typesGenerated: string[];
  typeDefinitions: TypeDefinition[];
  error?: string;
}
```

**Validation**:

- Component file must be valid TypeScript
- Props interface must extend base ComponentProps
- Variants must be properly typed

## Utility Function Contract

### Create Utility Function

**Endpoint**: File System  
**Method**: Create utility function file

**Request**:

```typescript
interface CreateUtilityRequest {
  functionName: string;
  implementation: string;
  dependencies: string[];
  types: TypeDefinition;
}
```

**Response**:

```typescript
interface CreateUtilityResponse {
  success: boolean;
  utilityPath: string;
  functionExported: boolean;
  error?: string;
}
```

**Validation**:

- Function name must be valid identifier
- Implementation must be valid TypeScript
- Dependencies must be installed
- Types must be properly defined

## Theme Contract

### Apply Theme

**Endpoint**: CSS Variables  
**Method**: Update CSS custom properties

**Request**:

```typescript
interface ApplyThemeRequest {
  colors: ColorPalette;
  spacing: SpacingScale;
  typography: TypographyConfig;
  breakpoints: BreakpointConfig;
}
```

**Response**:

```typescript
interface ApplyThemeResponse {
  success: boolean;
  cssVariablesUpdated: string[];
  componentsAffected: string[];
  error?: string;
}
```

**Validation**:

- Color values must be valid CSS colors
- Spacing values must be valid CSS units
- Typography must be properly configured
- All components must be compatible with theme

## Error Handling Contract

### Error Response

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  details?: Record<string, any>;
}

type ErrorCode =
  | "COMPONENT_NOT_FOUND"
  | "INVALID_CONFIGURATION"
  | "TYPE_GENERATION_FAILED"
  | "DEPENDENCY_MISSING"
  | "FILE_SYSTEM_ERROR"
  | "VALIDATION_FAILED";
```

### Success Response

```typescript
interface SuccessResponse {
  success: true;
  data: any;
  warnings?: string[];
}
```

## Type Definitions

```typescript
interface TailwindConfig {
  config: string;
  css: string;
  baseColor: string;
  cssVariables: boolean;
  prefix: string;
}

interface Aliases {
  components: string;
  utils: string;
  ui: string;
  lib: string;
  hooks: string;
}

interface UtilsConfig {
  tailwindConfig: string;
  tailwindBaseColor: string;
  tailwindCss: string;
  tailwindPrefix: string;
  tailwindCssVariables: boolean;
}

interface TypeDefinition {
  name: string;
  definition: string;
  exported: boolean;
  dependencies: string[];
}

interface ColorPalette {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  muted: string;
  accent: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
}

interface SpacingScale {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
}

interface TypographyConfig {
  fontFamily: {
    sans: string[];
    serif: string[];
    mono: string[];
  };
  fontSize: Record<string, [string, { lineHeight: string }]>;
  fontWeight: Record<string, string>;
}

interface BreakpointConfig {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
}
```

## Validation Rules

### Component Installation

1. Component name must exist in Shadcn UI registry
2. Target directory must be writable
3. No conflicting files (unless force option)
4. All dependencies must be installable

### Configuration Updates

1. JSON must be valid
2. All required fields present
3. Paths must resolve correctly
4. TypeScript paths must match aliases

### Type Generation

1. Component file must be valid TypeScript
2. Props must extend base interface
3. Variants must be properly typed
4. All types must be exportable

### Theme Application

1. All color values must be valid CSS
2. Spacing values must be valid units
3. Typography must be properly configured
4. All components must be compatible
