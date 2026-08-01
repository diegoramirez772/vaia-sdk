# @vaia-lab/sdk

**Agents with declared authority.** Connect your app to [Gandia-7](https://gandia7.com) and [Handeia](https://handeia.com), and let an assistant operate inside it — without writing the AI, and without giving it more power than you meant to.

Zero dependencies · Node 18+, Edge, Bun, Deno · TypeScript-first

```bash
npm i @vaia-lab/sdk
npx vaia init
```

---

## The problem it solves

Most agent SDKs can say *"the agent may call this function."*

None of them can say *"it may pay up to $500 on its own, above that it asks, and it may never delete."*

That second sentence is the difference between a demo and something you let run on real data. Here it's mandatory: **a piece without declared authority does not compile.**

```ts
tools: [{
  name: 'pay_invoice',
  description: 'Pays a pending invoice.',
  permission: 'write:payments',
  authority: {
    level: 'autonoma',            // autonoma | requiere_aprobacion | prohibida
    consequence: 'costosa',       // reversible | costosa | irreversible
    maxAmount: 500,
    currency: 'MXN',
    rationale: 'Small recurring invoices. Anything larger gets human review.',
  },
}]
```

### Rules you cannot opt out of

| rule | why |
|---|---|
| **Irreversible is never autonomous** | Doesn't rely on the model behaving well — it relies on the config being **impossible to write** |
| Autonomous spending needs **a cap and a currency** | A bare `500` means nothing, and guessing the currency is how money disappears |
| No piece may **exceed its agent's ceiling** | Otherwise you declare a limited agent and slip it a tool that does what the agent can't |
| A tool **without a permission** is rejected | No permission means no one to ask for consent, and no one to revoke it from |

Validation happens **when you declare**, not in production. A bad contract breaks on your desk, not in front of your user.

---

## The agent inside your app

You declare what you can do. The assistant reasons with that **plus what it knows about the user, which you never see**.

```ts
agent: {
  actions: [
    { name: 'filter_results', description: 'Narrows the visible list.',
      params: [{ name: 'city', type: 'string', description: 'City to filter by.' }] },
  ],
}
```

```ts
mountAgent({
  capabilityId: 'com.my-app',
  getContext: () => ({ route: location.pathname, claims: { visible: 12 } }),
  onAction: async (name, args) => run(name, args),
})
```

**Why the agent doesn't live in your app:** if it brought its own AI, it wouldn't know the user, it would start from zero every session, and — most importantly — **it could never disagree with itself**. This way, if your app scores one option 90 and another 87, the assistant can still recommend the 87, because it knows something about the user your app has no business knowing.

**What it deliberately cannot do:** it may only request actions you declared. It doesn't improvise, doesn't touch the DOM, doesn't find workarounds. Anything that writes gets confirmed with the user first.

---

## Borrowed connectors

Your app needs the user's GitHub or Drive. **You implement no OAuth, and you never receive their token.**

```ts
agent: { needs: ['github', 'drive'] }
```

You request an operation, the platform runs it with the token it already holds, and hands you back a trimmed result.

> If every app stored tokens, the attack surface would multiply by every developer who ships. One compromised app would hand over the GitHub and Drive of all its users. Borrowed, it only reaches what the user granted — rate-limited, audited, and revocable instantly.

Read-only. Writing to an external service is never lent: that's what the service itself is for.

---

## MCP, wrapped

MCP brings the catalog and the transport. This SDK brings the authority layer **MCP cannot express**.

```ts
const { tool, warnings } = fromMCPTool(mcpTool, authority, 'read:web')
```

**Importing something from the internet grants it nothing.** Authority is assigned separately, always. The server's own hints only ever produce warnings — *"it flags this as destructive but you declared it reversible"* — never decisions.

Outbound, `toMCPTool()` **withholds anything requiring approval**: exposing it would offer an external agent something even you can't run unattended.

---

## Use it without our platform

**Ten of the thirteen exports need no account, no network and no keys.** The authority layer is not tied to Gandia-7 or Handeia — it works with any LLM, any framework, any stack.

```ts
import { validatePieces, checkAuthority, fromMCPTool } from '@vaia-lab/sdk'

// Validate your agent's tools at build time — with your own runtime
const errors = validatePieces({ tools: myTools })
if (errors.length) throw new Error(errors.join('\n'))

// Gate a call before it happens, wherever your agent runs
const ok = checkAuthority(tool.authority, { amount: 900, currency: 'MXN' })
if (!ok.ok) return askHuman(ok.reason)
```

| works standalone | needs the platform |
|---|---|
| `defineCapability` · `toManifest` | `gandia.verify` · `handeia.jwt` |
| `validatePieces` · `checkAuthority` · `requiresApproval` | `mountAgent` |
| `validateAgentSurface` · `validateActionCall` | |
| `fromMCPTool` · `toMCPTool` · `toMCPTools` | |

Bring your own model. Bring your own orchestrator. Keep the guardrails.

---

## Identity, without a second login

Your app opens from Gandia-7 or Handeia with the user's session already resolved.

```ts
const claims = await handeia.jwt.fromUrl(request.url, process.env.HANDEIA_KEY_SECRET!)
```

And to verify a call genuinely came from the platform:

```ts
const { ctx } = await gandia.verify(request, process.env.GANDIA_KEY_SECRET!)
gandia.require(ctx, 'read:students')
```

Constant-time HMAC comparison, ±5 min window, and the health probe **requires a signature too**.

---

## The 7 pieces

`skills` · `tools` · `workflows` · `agents` · `personalities` · `modalities` · `permissions`

All declared, all validated, all carried in the manifest — so the portal can show **what authority a capability asks for before anyone installs it**.

---

## CLI

```bash
npx vaia init       # drops a ready vaia.config.ts — no account, no keys, no network
npx vaia manifest   # generates the manifest from your config
npx vaia sign       # signs a payload for testing
```

---

## Security

See [SECURITY.md](./SECURITY.md) — what the SDK guarantees, and what's on you, such as deduplicating `call_id` if replay within the window matters to you.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). What's open is **how to declare responsible agents**; the engines that run them are private.

## License

MIT
