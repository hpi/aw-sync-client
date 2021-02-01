const { spawnSync } = require(`child_process`)
const { resolve } = require(`path`)
const hyperdrive = require(`hyperdrive`)
const hyperswarm = require(`hyperswarm`)
const moment = require(`moment`)
const fetch = require(`node-fetch`)
const debug = require(`debug`)(`qnzl:aw:sync-client`)
const fs = require(`fs`)

const SIX_HOURS = 6 * 60 * 60 * 1000

const heartbeat = async () => {
  debug(`activity watch sync heartbeat`)
  const bucketData = await fetch(`http://localhost:5600/api/0/export`)

  const data = await bucketData.json()

  debug(`reconciling data export with remote`)
  await fetch(`${process.env.AW_SYNC_SERVER}/api/v1/reconcile`, {
    method: `POST`,
    headers: {
      Authorization: `Bearer ${process.env.AW_AUTHORIZATION_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data),
  })

  if (process.argv[2] !== `once`) {
    debug(`create next heartbeat timer`)
    setTimeout(() => {
      heartbeat()
    }, SIX_HOURS)
  } else {
    process.exit(0)
  }
}

process.on(`SIGINT`, () => {
  if (process.argv[2] === `once`) return

  const out = spawnSync(`node ${__filename}`, [ `once` ], { encoding: `utf8` })

  process.exit(10)
})

process.on(`exit`, (exitCode) => {
  debug(`closing local aw sync`)

  if (process.argv[2] === `once`) return
  if (exitCode === 10) return

  const out = spawnSync(`node ${__filename}`, [ `once` ], { encoding: `utf8` })
})

heartbeat()
