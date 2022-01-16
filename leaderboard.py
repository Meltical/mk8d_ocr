import time
import cv2
import os
import sys
from datetime import datetime

# Template
x = cv2.imread("./samples/x.jpg")

# Get Video from Capture Card (720p)
video = cv2.VideoCapture(-1)
video.set(3, 1280)
video.set(4, 720)

# Variables
roundNbr = 1
maxRoundNbr = 12

# Parse arguments: 
#  [Argv1] = folderName, Default: Current Date (ex: 01-01-2022 20:00:00)
cwd = os.path.abspath(os.getcwd())
if sys.argv[1:]:
    folderName = str(sys.argv[1])
    folderPath = os.path.join(str(cwd), "war", folderName)
else:
    folderPath = os.path.join(str(cwd), "war", datetime.now().strftime('%d-%m-%Y %H%M%S'))
os.mkdir(folderPath)

#  [Argv2] = roundNbr, Default: 1
if sys.argv[2:]:
    roundNbr = int(sys.argv[2])

#  [Argv3] = maxRoundNbr, Default: 12
if sys.argv[3:]:
    maxRoundNbr = int(sys.argv[3])

# Start Web Server
os.system("start run_local_server.bat")

print("Capturing " + str(maxRoundNbr) + " Rounds In Folder: " + folderPath)

# Main loop
while True:
    if (cv2.waitKey(1) & 0xFF == ord('q')) or roundNbr == maxRoundNbr:
        break

    # Get one frame, resize and crop
    success, img = video.read()
    cv2.imshow("Result", img)
    cv2.resize(img, (1280, 720))

    cropped = img[38:38+32, 44:44+32]
    result = cv2.matchTemplate(cropped, x, cv2.TM_CCOEFF_NORMED)
    (minVal, maxVal, minLoc, maxLoc) = cv2.minMaxLoc(result)

    # If matching template over 70%
    if(maxVal > 0.7):
        # Wait 3 seconds (animations, adding points...)
        time.sleep(3)

        # Get leaderboard and save it
        success, img = video.read()
        cv2.resize(img, (1280, 720))
        filename = "Round_" + str(roundNbr) + ".jpg"
        filePath = os.path.join("war", folderName, filename)
        cv2.imwrite(filePath, img)
        os.system("start http://localhost/table.html?file=" + filePath)

        roundNbr += 1
        time.sleep(10)
