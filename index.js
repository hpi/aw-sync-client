const { spawnSync } = require(`child_process`)
const { resolve } = require(`path`)
const hyperdrive = require(`hyperdrive`)
const hyperswarm = require(`hyperswarm`)
const moment = require(`moment-timezone`)
const fetch = require(`node-fetch`)
const debug = require(`debug`)(`qnzl:aw:sync-client`)
const fs = require(`fs`)

const ONE_HOUR = 60 * 60 * 1000

const TIME_MARKER_FILE = resolve(__dirname, `marker`)

const loadMarker = () => {
  const stringTimeMarker = fs.readFileSync(TIME_MARKER_FILE, `utf8`).trim()

  debug(`loaded ${stringTimeMarker} as time marker`)

  return moment(stringTimeMarker) || moment()
}

let TIME_MARKER = loadMarker()

const WEB_QUERY = [
  "afk_events = query_bucket(find_bucket(\"aw-watcher-afk_\"));",
  "chrome_events = query_bucket(find_bucket(\"aw-watcher-web-chrome\"));",
  "firefox_events = query_bucket(find_bucket(\"aw-watcher-web-firefox\"));",
  "events = concat(chrome_events, firefox_events);",
  "filtered_events = filter_period_intersect(events, filter_keyvals(afk_events, \"status\", [\"not-afk\"]));",
  "merged_events = merge_events_by_keys(filtered_events, [\"url\", \"title\", \"audible\", \"incognito\", \"tabCount\"]);",
  "RETURN = [merged_events, filtered_events];"
]

const VIM_QUERY = [
  "afk_events = query_bucket(find_bucket(\"aw-watcher-afk_\"));",
  "events = query_bucket(find_bucket(\"aw-watcher-vim_\"));",
  "filtered_events = filter_period_intersect(events, filter_keyvals(afk_events, \"status\", [\"not-afk\"]));",
  "merged_events = merge_events_by_keys(filtered_events, [\"file\", \"language\", \"project\"]);",
  "RETURN = [merged_events, filtered_events];"
]

const WINDOW_QUERY = [
  "afk_events = query_bucket(find_bucket(\"aw-watcher-afk_\"));",
  "window_events = query_bucket(find_bucket(\"aw-watcher-window_\"));",
  "window_events = filter_period_intersect(window_events, filter_keyvals(afk_events, \"status\", [\"not-afk\"]));",
  "filtered_events = exclude_keyvals(window_events, \"app\", [ \"Google-chrome\", \"Brave-browser\", \"Safari\" ]);",
  "merged_events = merge_events_by_keys(filtered_events, [\"app\", \"title\"]);",
  "RETURN = [merged_events, filtered_events]"
]

const heartbeat = async () => {
  try {
    debug(`activity watch sync heartbeat`)
    const queries = {
      web: WEB_QUERY,
      vim: VIM_QUERY,
      window: WINDOW_QUERY,
    }

    const addPromises = Object.keys(queries).map(async (queryKey) => {
      debug(`using ${TIME_MARKER.format()} as oldest time`)

      const newQuery = {
        query: queries[queryKey],
        timeperiods: [
          `${TIME_MARKER.format()}/${moment().format()}`
        ],
      }

      const bucketData = await fetch(`http://localhost:5600/api/0/query`, {
        method: `POST`,
        headers: {
          [`Content-Type`]: `application/json`,
        },
        body: JSON.stringify(newQuery),
      })

      const [[ mergedEvents, allEvents ]] = await bucketData.json()

      debug(`got ${mergedEvents.length} merged and ${allEvents.length} in all`)
      const eventIds = allEvents.reduce((ids, { id }) => {
        ids.push(id)

        return ids
      }, [])

      debug(`syncing data`)
      return fetch(`${process.env.AW_SYNC_SERVER}/api/v1/add/${queryKey}`, {
        method: `POST`,
        headers: {
          Authorization: `Bearer ${process.env.AW_AUTHORIZATION_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mergedEvents,
          eventIds,
        }),
      })

      return Promise.resolve()
    })

    const a = await Promise.allSettled(addPromises)
    saveMarker()

    if (process.argv[2] !== `once`) {
      debug(`create next heartbeat timer`)
      setTimeout(() => {
        heartbeat()
      }, ONE_HOUR)
    } else {
      process.exit(0)
    }
  } catch (e) {
    console.error(`Error occurred getting events: `, e)
  }
}

const saveMarker = () => {
  TIME_MARKER = moment().format()

  debug(`saving ${TIME_MARKER} as time marker`)

  return fs.writeFileSync(TIME_MARKER_FILE, TIME_MARKER)
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
