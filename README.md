# Magic Art

A modern e-commerce web application for art products built with React, Vite, and Supabase.

## Features

- Product catalog with category filtering
- Shopping cart functionality
- WhatsApp integration for orders
- Responsive design with Tailwind CSS
- Google Analytics integration
- Lazy image loading

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Supabase
- **State Management**: React Query, Context API
- **Animations**: Framer Motion
- **Routing**: React Router DOM

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file with:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_GA_MEASUREMENT_ID=your_ga_id
   VITE_GA_ENABLED=true
   ```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Code Quality

```bash
npm run lint    # Run ESLint
npm run format  # Format code with Prettier
```
