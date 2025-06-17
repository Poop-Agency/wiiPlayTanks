Voici un diagramme d’architecture du projet Mars Rover Distribué en Node.js + TypeScript, découpé selon les responsabilités logiques et physiques.
🧭 Diagramme d’architecture — Mars Rover Distribué

+------------------------------------------------------+
|                     MissionControl                   |
|    (Interface utilisateur / Console - TCP Client)    |
+------------------------------------------------------+
|  UI Console (keyboard, display map, CLI feedback)    |
|  └── ui/                                             |
|  Command Builder & Parser                            |
|  └── core/command/                                   |
|  RoverClient (TCP client with auth/integrity)        |
|  └── network/                                        |
|  MapState (obstacles, rover location tracking)       |
|  └── domain/                                         |
+------------------------------------------------------+
                 │             ↑  
                 │ TCP (Commands + Auth)  
                 ▼             │
+------------------------------------------------------+
|                  (Optional) Repeater                 |
|              (TCP Proxy / Message Forwarder)         |
+------------------------------------------------------+
|  Listens on TCP, relays to actual Rover host         |
|  Verifies basic packet integrity (if desired)        |
+------------------------------------------------------+
                 │             ↑  
                 │ TCP forwarding (transparent)
                 ▼             │
+------------------------------------------------------+
|                        Rover                         |
|            (TCP Server — Agent distant)              |
+------------------------------------------------------+
|  TCP Server with command parsing & HMAC validation   |
|  └── network/                                        |
|  RoverEngine: Position, Orientation, Toroidal Logic  |
|  └── core/                                           |
|  Obstacle Manager (static or random)                 |
|  └── domain/                                         |
|  RoverConfig (initial (x,y), map size, orientation)  |
|  └── config/                                         |
|  State Manager (returns updated state after cmd)     |
|  └── core/state/                                     |
|  Logger & Exception handler                          |
|  └── utils/                                          |
+------------------------------------------------------+

📂 Vue multi-package (monorepo structure via pnpm ou npm workspaces)

mars-rover/
├── packages/
│   ├── rover/               # Contient le serveur TCP (le Rover distant)
│   ├── mission-control/     # Console utilisateur (client TCP)
│   └── repeater/            # (Optionnel) Proxy TCP qui relaye Rover
├── shared/                  # Typage partagé, constantes, messages, sécurité
├── tsconfig.base.json
├── pnpm-workspace.yaml
├── README.md

🔁 Échanges Réseau : Séquence d'interactions

sequenceDiagram
  participant MC as MissionControl
  participant REP as Repeater (optionnel)
  participant ROV as Rover

  MC->>REP: Envoie commande (ex: "FFLFRB")
  REP->>ROV: Transmet la commande (TCP)
  ROV-->>REP: Réponse état Rover (coord, orientation)
  REP-->>MC: Affiche dans la console (mise à jour carte)

🎯 Points d’attention Architecture
Domaine	Implémentation
Sécurité	HMAC SHA256, validation intégrité message
Toroïdalité	x = (x + dx + width) % width
Obstacles	Map en mémoire, collision = arrêt
Non-réentrance	Commande atomique, rollback impossible
UI Console	readline, chalk, blessed, etc.
Résilience	Catch global + retry client TCP
Tests	Unités (vitest/jest), mocks TCP