## watchers/aw-sync-client

Sync client for ActivityWatch, synchronizes multiple local repos of activitywatch to a remote server where you view your usage in total.

### Install

`npm install`

### Usage

- Run your ActivityWatch clients
- Set the following environment variables:
  - AW_SYNC_SERVER (url of the server component)
  - AW_AUTHORIZATION_TOKEN (JWT generated from GraphQL scripts)
  - CRONITOR_AW_ID (if you want to use it, but otherwise you may need to remove this call)


