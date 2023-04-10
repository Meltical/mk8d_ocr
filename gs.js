const fs = require("fs").promises
const path = require("path")
const process = require("process")
const { authenticate } = require("@google-cloud/local-auth")
const { google } = require("googleapis")
require('dotenv').config(); 

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json")
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json")

const SPREADSHEET_ID = process.env.SPREADSHEET_ID
const SHEET = process.env.SHEET
const RANGE_1 = "A1:C12"
const RANGE_2 = "Q1:S12"
const RANGE_3 = "AG1:AI12"
const RANGE_4 = "AW1:AY12"
const RANGE_5 = "BM1:BO12"
const RANGE_6 = "CC1:CE12"
const RANGE_7 = "CS1:CU12"
const RANGE_8 = "DI1:DK12"
const RANGE_9 = "DY1:EA12"
const RANGE_10 = "EO1:EQ12"
const RANGE_11 = "FE1:FG12"
const RANGE_12 = "FU1:FW12"

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
	try {
		const content = await fs.readFile(TOKEN_PATH)
		const credentials = JSON.parse(content)
		return google.auth.fromJSON(credentials)
	} catch (err) {
		return null
	}
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
	const content = await fs.readFile(CREDENTIALS_PATH)
	const keys = JSON.parse(content)
	const key = keys.installed || keys.web
	const payload = JSON.stringify({
		type: "authorized_user",
		client_id: key.client_id,
		client_secret: key.client_secret,
		refresh_token: client.credentials.refresh_token,
	})
	await fs.writeFile(TOKEN_PATH, payload)
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
	let client = await loadSavedCredentialsIfExist()
	if (client) {
		return client
	}
	client = await authenticate({
		scopes: SCOPES,
		keyfilePath: CREDENTIALS_PATH,
	})
	if (client.credentials) {
		await saveCredentials(client)
	}
	return client
}

const range = (i) => {
	let range = SHEET + "!"
	switch (Number(i)) {
		case 1:
			range += RANGE_1
			break
		case 2:
			range += RANGE_2
			break
		case 3:
			range += RANGE_3
			break
		case 4:
			range += RANGE_4
			break
		case 5:
			range += RANGE_5
			break
		case 6:
			range += RANGE_6
			break
		case 7:
			range += RANGE_7
			break
		case 8:
			range += RANGE_8
			break
		case 9:
			range += RANGE_9
			break
		case 10:
			range += RANGE_10
			break
		case 11:
			range += RANGE_11
			break
		case 12:
			range += RANGE_12
			break
	}

	return range
}

async function upload(auth, vals, i) {
	const service = google.sheets({ version: "v4", auth })
	const values = vals.reduce((a, c) => {
		a.push([c.name, c.flag, c.score])
		return a
	}, [])
	const data = [{ range: range(i), values }]
	const resource = { data, valueInputOption: "USER_ENTERED" }
	try {
		await service.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, resource })
	} catch (err) {
		// TODO (developer) - Handle exception
		throw err
	}
}

const gs = (vals, i) => {
	authorize()
		.then((auth) => upload(auth, vals, i))
		.catch(console.error)
}

module.exports = { gs }
