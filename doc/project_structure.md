# Project Structure Analysis

This document provides a detailed analysis of the `TierMaker` repository structure.

## Directory Tree

```
tier-list-simple/
├── .github/                 # GitHub workflows and configurations
├── public/                  # Static assets (images, icons)
├── doc/                     # Documentation files
├── src/                     # Source code
│   ├── components/          # Vue UI components
│   └── utils/               # Utility functions and logic
├── config.yaml              # Application configuration
├── index.html               # HTML entry point
├── package.json             # Project metadata and dependencies
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build configuration
└── README.md                # Project README
```

## Module Descriptions

### Source Code (`src/`)

The core application logic resides here.

- **`main.ts`**: The application entry point. Initializes the Vue app and mounts it to the DOM.
- **`App.vue`**: The root Vue component.
- **`types.ts`**: TypeScript type definitions ensuring type safety across the application.
- **`style.css`**: Global stylesheets.
- **`vite-env.d.ts`**: TypeScript declarations for Vite environment variables.

### Components (`src/components/`)

Contains reusable Vue components for the UI.

- **`TierList.vue`**: The main component connecting the tier rows and managing the overall list state.
- **`TierRow.vue`**: Represents a single tier row (e.g., S, A, B). Supports drag-and-drop interactions.
- **`ConfigModal.vue`**: A modal interface for modifying application settings (themes, layouts, etc.).
- **`EditItemModal.vue`**: A modal for editing individual item details in the tier list.
- **`SearchModal.vue`**: A modal for searching and adding new items from external sources (e.g., Bangumi, VNDB, local).

### Utilities (`src/utils/`)

Helper functions and business logic refactored out of components.

- **`bangumi.ts`**: Encapsulates API interactions with [Bangumi](https://bgm.tv/). Handles searching and fetching anime details.
- **`vndb.ts`**: Encapsulates API interactions with [VNDB](https://vndb.org/) for Visual Novel data.
- **`dragManager.ts`**: Manages complex drag-and-drop logic for sorting items between tiers.
- **`configManager.ts`**: Handles configuration management. Reads `config.yaml`, merges with LocalStorage user preferences, and injects CSS variables for dynamic sizing.
- **`exportUtils.ts`**: Utilities for exporting the tier list as Images or PDFs. Handles canvas generation, CORS issues, and image processing.
- **`storage.ts`**: Wrapper around LocalStorage for persisting application state.
- **`url.ts`**: Helper functions for URL manipulation and parsing.

### Root Files

- **`config.yaml`**: Defines default configuration values (e.g., item sizes, default tiers).
- **`vite.config.ts`**: Configuration for the Vite build tool, including plugins and server settings.
- **`tsconfig.json`**: TypeScript compiler options.
- **`package.json`**: Lists dependencies (Vue, html2canvas, jspdf, etc.) and scripts (`dev`, `build`).

## Key Discoveries

- **Configuration System**: The app uses a hybrid configuration system (`configManager.ts`) that combines a static `config.yaml` with user overrides stored in `LocalStorage`.
- **Multi-Source Support**: The project supports multiple metadata sources, currently implemented for both Bangumi (`bangumi.ts`) and VNDB (`vndb.ts`).
- **Custom Drag & Drop**: Instead of relying solely on a library, `dragManager.ts` implements custom logic for handling item reordering.
