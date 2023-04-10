const { ImageHelper } = require("./ImageHelper.js")
const { gs } = require("./gs.js")
const filePath = process.argv[2]
const roundNbr = process.argv[3]
ImageHelper.fromSrc(filePath, (img) => {
	img = img.stretchTo(1280, 720)

	const playersData = img.extractPlayers(false)
	const players = playersData.map((playerData) => playerData.recognizePlayer())

	const flagsData = img.extractFlags(false)
	const flags = flagsData.map((playerData) => playerData.recognizeFlag())

	const scoresData = img.extractScores(false)
	const scores = scoresData.map((playerData) => playerData.recognizeScore())

	const result = players.map((player, i) => {
		return {
			name: player.str,
			flag: flags[i],
			score: scores[i],
		}
	})
	console.log(result)
	gs(result, roundNbr)
})
