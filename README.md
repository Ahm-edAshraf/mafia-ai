# Mafia Game

A real-time multiplayer Mafia/Werewolf game with AI-powered bots built using Next.js and Convex.

## Features

- **Real-time Gameplay** - Powered by Convex for instant synchronization
- **AI Bots** - Intelligent bot players using Groq AI
- **Classic Roles** - Mafia, Doctor, Sheriff, and Citizens
- **Live Chat** - In-game discussion during day phases
- **Spectator Mode** - Watch games after elimination
- **Timed Phases** - Automatic phase transitions with timers

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Convex (real-time database + serverless functions)
- **AI**: Groq SDK for bot decision-making
- **UI Components**: Radix UI + shadcn/ui

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- A [Convex](https://convex.dev) account
- A [Groq](https://groq.com) API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mafia-game.git
   cd mafia-game
   ```

2. Install dependencies:
   ```bash
   bun install
   # or npm install
   ```

3. Set up Convex:
   ```bash
   npx convex dev
   ```

4. Create `.env.local` with your API keys:
   ```env
   CONVEX_DEPLOYMENT=your-convex-deployment
   NEXT_PUBLIC_CONVEX_URL=your-convex-url
   GROQ_API_KEY=your-groq-api-key
   ```

5. Run the development server:
   ```bash
   bun dev
   # or npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## How to Play

1. **Create a Lobby** - Enter your name and create a game
2. **Add Players** - Share the code or add AI bots
3. **Start the Game** - Roles are assigned randomly
4. **Night Phase** - Special roles perform their actions
5. **Day Phase** - Discuss and vote to eliminate suspects
6. **Win Condition** - Town wins by eliminating all Mafia; Mafia wins when they equal or outnumber Town

## Roles

| Role | Team | Night Action |
|------|------|--------------|
| Mafia | Evil | Choose a player to eliminate |
| Doctor | Town | Protect a player from elimination |
| Sheriff | Town | Investigate a player's alignment |
| Citizen | Town | No special ability |

## License

MIT License - see [LICENSE](LICENSE) for details.
