# Concepts

OmniUI keeps the first integration path small, but the runtime uses a few stable concepts.

## Action

An action is an app-owned capability such as `todo.complete`, `issue.close`, or `order.refund`. OmniUI validates and dispatches actions, but your app defines the action contract.

## Executor

An executor is the app-owned function that performs the action against your existing state, reducer, service, or router. Executors should return structured results such as `{ status: "changed" }`.

## Snapshot

The Interaction Snapshot is the current runtime view of the page: visible entities, labels, state, focus, and currently available actions. It is not your full app state or source code.

## Manifest

The App Manifest describes global capabilities such as registered routes and app-level commands. It lets resolvers understand what the app can do without scraping the whole project.

## Resolver

A resolver converts user input into candidate actions and targets. Local rules run offline. Optional server or LLM resolvers can propose candidates, but they still pass through local validation and policy.

## CommandEnvelope

A `CommandEnvelope` freezes the validated command, target anchor, provenance, and dispatch metadata before execution. This prevents late resolver changes from mutating the command that the executor receives.
