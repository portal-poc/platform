# How it fits together

Three views of the same system: what runs in the browser, which package each app uses, and how a build gets to a
stand. Start here, then follow the links to the package READMEs and the [playbook](playbook.md).

## 1. In the browser: host, remotes, packages, backends

```mermaid
flowchart TB
  subgraph stand["Stand, e.g. dev2.poc.ashirokov.dev — served from Nexus portal-stands/dev2/"]
    hostbuild["host build"]
    cfg["/config.json<br/>which remotes, versions, routes, scopes<br/>(built from the registry)"]
    compat["compat.json<br/>what this host provides"]
  end

  subgraph page["One browser page"]
    subgraph host["host"]
      hauth["one login<br/>platform-runtime/msal"]
      hload["remote loader · gate 3<br/>mf-shared checks"]
      hshell["router · menu · leave dialog · titles<br/>event bus · devtools<br/>platform-runtime"]
      shared["MF singletons: react · react-router<br/>emotion · joy · @portal-poc/ds"]
    end
    subgraph tasks["tasks remote — integrated"]
      troot["RemoteRoot(platform)<br/>platform-runtime: PlatformProvider,<br/>useLeaveGuard, usePageTitle"]
      tq["own QueryClient"]
      thttp["http client<br/>@portal-poc/http"]
      trt["realtime client<br/>@portal-poc/realtime"]
      tcfg["own config.json<br/>BFF URL, scopes, ws URL per stand"]
    end
    subgraph legacy["legacy remote — bridge, React 18, shares nothing"]
      lroot["RemoteBridge(platform)<br/>own React + router"]
    end
  end

  nexus[("Nexus portal-releases<br/>remote manifests + chunks")]
  tbff[["tasks-bff<br/>REST + WebSocket"]]
  lbff[["legacy-bff<br/>on-behalf-of exchange"]]
  idp[["identity provider"]]

  hostbuild --> host
  host -- "1 · reads at start" --> cfg
  hload -- "2 · manifest + chunks" --> nexus
  hload -- "3 · checks against" --> compat
  hload -- "4 · mounts, passes the contract" --> troot
  hload -- "4 · mounts in isolation" --> lroot
  troot -. "uses the host's copies" .-> shared
  troot --> tq
  tq --> thttp
  thttp -- "5 · token for its scopes" --> hauth
  lroot -- "5 · token for legacy-bff" --> hauth
  hauth -- "login (only the host)" --> idp
  thttp -- "6 · REST" --> tbff
  trt -- "7 · WS, 'refetch' topics" --> tbff
  lroot -- "6 · REST with the host token" --> lbff
  tcfg -. "address + scopes" .-> thttp
  troot -- "8 · events (catalog), leave guards, title" --> hshell
```

1. The host is one build for every stand; it reads the stand's `/config.json` before rendering
   ([host README](https://github.com/portal-poc/host#readme)).
2. A remote is loaded from its manifest URL in Nexus — immutable version folder on release stands.
3. Gate 3: contract version, singletons and build tooling of the manifest are checked against this host
   ([mf-shared](../packages/mf-shared/README.md)); incompatible → the bridge build or an error inside that area only.
4. The host mounts `RemoteRoot` (integrated, shares React / router / DS) or `RemoteBridge` (own React root) and passes
   the `platform` object — the [contract](../packages/platform-contract/README.md). Nothing goes through `window`.
5. Every token comes from the host's single login, limited to the scopes in the remote's registry entry.
6. Each remote calls ITS OWN BFF with ITS OWN client and config ([http](../packages/http/README.md)); the host knows no
   BFF address. Legacy keeps its identity provider: its BFF exchanges the portal token
   ([ADR 0027](adr/0027-legacy-auth-token-exchange.md)).
7. Optional: a remote's own socket to its BFF for "refetch" notifications ([realtime](../packages/realtime/README.md)).
8. Between apps only through the platform: catalog events ([events](../packages/events/README.md)), leave guards and
   titles ([runtime](../packages/platform-runtime/README.md)).

## 2. Which package each app uses

```mermaid
flowchart LR
  subgraph apps["Applications"]
    host["host"]
    tasks["tasks-remote<br/>(reference remote)"]
    legacy["legacy-remote<br/>(React 18 bridge)"]
    registry["registry"]
  end

  subgraph runtime_pkgs["Run in the browser"]
    contract["platform-contract<br/>types"]
    rt["platform-runtime<br/>hooks · QueryClient · guards"]
    http["http"]
    events["events"]
    realtime["realtime (opt-in)"]
    ds["ds (MF singleton)"]
  end

  subgraph build_pkgs["Build, check, deliver"]
    vite["vite-config"]
    mfs["mf-shared"]
    presets["presets"]
    cli["cli (portal-cli)"]
  end

  host --> rt & http & events & ds & contract
  host --> vite & presets & mfs
  tasks --> rt & http & events & realtime & ds & contract
  tasks --> vite & presets & cli
  legacy --> contract
  legacy --> vite & presets & cli
  registry --> cli

  rt --> contract
  http --> contract
  events --> contract
  realtime --> contract
  vite --> mfs
  cli --> mfs & presets
```

| Package | Host | Integrated remote | Legacy (bridge) | Docs |
|---|---|---|---|---|
| platform-contract | builds the object | receives it as a prop | receives it as a prop | [README](../packages/platform-contract/README.md) |
| platform-runtime | host builders: auth per remote, leave guards, event bus, devtools, stale-build | hooks, own QueryClient, standalone | — (calls the contract directly) | [README](../packages/platform-runtime/README.md) |
| http | its own host-bff client | its BFF client | — (own client) | [README](../packages/http/README.md) |
| events | subscribes (bookmarks widget) | publishes | — | [README](../packages/events/README.md) |
| realtime | — | its BFF socket | possible (React 18 supported) | [README](../packages/realtime/README.md) |
| ds | provides the singleton | uses the host's copy | — (own UI) | [README](../packages/ds/README.md) |
| vite-config | `createHostViteConfig` → `compat.json` | `createRemoteViteConfig` → `dist/` + `dist-bridge/` | `isolated: true` | [README](../packages/vite-config/README.md) |
| mf-shared | runtime checks | (through vite-config / cli) | (through vite-config / cli) | [README](../packages/mf-shared/README.md) |
| presets | lint, TS, tests | lint, TS, tests | lint, TS, tests | [README](../packages/presets/README.md) |
| cli | (pipelines) | verify, upgrade, deploy | verify, deploy | [README](../packages/portal-cli/README.md) |

## 3. From a commit to a stand

```mermaid
flowchart LR
  dev(["developer: Deploy<br/>stand + ref"]) --> wf["central deploy.yml @v2<br/>pnpm dlx @portal-poc/cli@2 deploy"]
  wf --> rules{"stand rules<br/>registry stands.json"}
  rules -- "wrong ref" --> refused(["refused before the build"])
  rules -- ok --> build["build + verify<br/>vite-config, gate 1"]
  build --> gate{"gate 2<br/>vs the stand host's compat.json"}
  gate -- incompatible --> blocked(["blocked"])
  gate -- ok --> nexus[("Nexus<br/>releases: immutable version<br/>dev3: snapshot overwritten")]
  nexus --> reg["registry commit<br/>stand/remote.json"]
  reg --> cd["Config deploy<br/>registry build --upload"]
  cd --> cfg["stand /config.json"]
  cfg --> page(["next page load runs it"])
  reg -. "Promote dev1 → tst<br/>same artifacts" .-> reg
```

Every scenario (feature, release, hotfix, promote, rollback, stand switch, host deploy, platform upgrade), with
marble diagrams: [playbook.md](playbook.md). Pipelines: [central workflows](../.github/workflows/README.md).
