const { spawnSync } = require(`child_process`)
const hyperdrive = require(`hyperdrive`)
const hyperswarm = require(`hyperswarm`)
const cronitor = require(`cronitor-caller`)(process.env.CRONITOR_KEY)
const moment = require(`moment`)
const fetch = require(`node-fetch`)
const debug = require(`debug`)(`qnzl:aw:sync-client`)

const TEN_MINUTES = 5 * 60 * 1000

const CRONITOR_AW_ID = process.env.CRONITOR_AW_ID

let lastUploadMarker = null

const sliceData = (data) => {
  const dataSlices = []

  debug(`slice data of len ${data.length}`)
  for (let i = 0; i < Math.ceil(data.length / 300); i++) {
    const sliceBegin = i * 300
    let sliceEnd = (i + 1) * 300

    sliceEnd = sliceEnd > data.length ? data.length : sliceEnd

    debug(`slice begin: ${sliceBegin}\nSlice end: ${sliceEnd}`)

    const dataSlice = data.slice(sliceBegin, sliceEnd)
    dataSlices.push(dataSlice)
  }

  return dataSlices
}

const filterData = (data, marker) => {
  if (!marker) return data

  return data.filter((event) => {
    const eventTimestamp = moment(event.timestamp)

    return moment(marker).isBefore(eventTimestamp)
  })
}

const heartbeat = async () => {
  debug(`activity watch sync heartbeat`)
  let localBuckets = await fetch(`http://localhost:5600/api/0/buckets`)

  localBuckets = await localBuckets.json()

  cronitor.run(CRONITOR_AW_ID)

  debug(`got buckets`)
  const promises = Object.values(localBuckets).map(async ({ id }) => {
    debug(`get events for bucket ${id}`)
    let bucketData = await fetch(`http://localhost:5600/api/0/buckets/${id}/events`)

    let data = await bucketData.json()
    data = filterData(data, lastUploadMarker)

    debug(`got ${data.length} events for ${id}`)
    let dataSlices = sliceData(data)

    debug(`created ${dataSlices.length} slices to upload`)
    dataSlices.forEach(async (slice, index) => {
      debug(`upload slice #${index} for bucket ${id}`)
      await fetch(`${process.env.AW_SYNC_SERVER}/api/v1/add/${id}`, {
        method: `POST`,
        headers: {
          Authorization: `Bearer ${process.env.AW_AUTHORIZATION_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: slice,
          timestamp: new Date()
        })
      })
    })
  })

  Promise.all(promises)
    .then(() => {
      lastUploadMarker = moment()
    })


  if (process.argv[2] !== `once`) {
    debug(`create next heartbeat timer`)
    setTimeout(() => {
      heartbeat()
    }, TEN_MINUTES)
  } else {
    process.exit(0)
  }
}

process.on(`SIGINT`, () => {
  if (process.argv[2] === `once`) return

  cronitor.fail(CRONITOR_AW_ID)
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
