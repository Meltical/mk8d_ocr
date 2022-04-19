import argparse
import time
import cv2
import os
import sys
import keyboard
from datetime import datetime
from threading import Thread
import threading

lock = threading.RLock()

def scanInput():
    global run, args, video, roundNbr, maxRoundNbr, manualCapturePath
    while run:
        keyPressed = keyboard.read_key()
        if args.debug:
            print(str("key pressed: " + keyPressed))
        if keyPressed == 'pg.prec' or roundNbr == maxRoundNbr + 1 or (cv2.waitKey(1) & 0xFF == ord('q')):
            print("Capturing Ended.")
            with lock:
                run = False

        if keyPressed == "pg.suiv":
            _, img = video.read()
            _, img = video.read()
            cv2.resize(img, (1920, 1080))
            fileName = datetime.now().strftime('%d-%m-%Y_%H%M%S') + ".jpg"
            filePath = os.path.join(manualCapturePath, fileName)
            print("Manual Capture saved as '" + filePath + "'")
            cv2.imwrite(filePath, img)
            os.system("start http://localhost/table.html?file=manual_capture/" + fileName)

def recognize(template):
    global run, args, video, roundNbr, folderPath, folderName
    while run:
        # Get one frame, resize and crop
        _, img = video.read()
        cv2.resize(img, (1920, 1080))

        cropped = img[57:57+48, 66:66+48]
        result = cv2.matchTemplate(cropped, template, cv2.TM_CCOEFF_NORMED)
        (minVal, maxVal, minLoc, maxLoc) = cv2.minMaxLoc(result)

        if args.debug:
            print("maxVal: " + str(maxVal))
            cv2.imshow("Result", img)
            cv2.imshow("cropped", cropped)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                video.release()
                cv2.destroyAllWindows()

        # If matching template over 70%
        if(maxVal > 0.7):
            # Wait 3 seconds (animations, adding points...)
            time.sleep(3)

            # Get leaderboard and save it
            _, img = video.read()
            cv2.resize(img, (1920, 1080))
            fileName = "Round_" + str(roundNbr) + ".jpg"
            
            filePath = os.path.join(folderPath, fileName)
            cv2.imwrite(filePath, img)
            os.system("start http://localhost/table.html?file=war/" + folderName + "/" + fileName)

            with lock:
                roundNbr += 1

            time.sleep(10)
            print("Captured Round #" + str(roundNbr - 1))

    video.release()
    cv2.destroyAllWindows()
    
if __name__ == "__main__":
    global run, args, video, roundNbr, folderPath, folderName, maxRoundNbr, manualCapturePath
    
    # Template
    x = cv2.imread("./samples/x.jpg")

    # Variables
    roundNbr = 1
    maxRoundNbr = 12
    manualCapturePath = os.path.join(os.getcwd(), "manual_capture")
    run = True

    # Parse arguments: 
    parser=argparse.ArgumentParser()
    parser.add_argument('--name', help='Change Folder Name (Default: Current Date)')
    parser.add_argument('--max', help='Change Max Round Number (Default: 12)')
    parser.add_argument('--card', help='Change Capture Card Index (Default: 1)')
    parser.add_argument('--debug', help='Show the cv2 screen (Default: false)', dest='debug', default=False, action='store_true')
    parser.add_argument('--auto', help='Automatically trigger end round (Default: false)', dest='auto', default=False, action='store_true')
    args=parser.parse_args()

    cwd = os.path.abspath(os.getcwd())
    if args.auto:
        if args.max:
            maxRoundNbr = int(args.max)
        if args.name:
            folderName = str(args.name)
        else:
            folderName = datetime.now().strftime('%d-%m-%Y_%H%M%S')
        
            folderPath = os.path.join(str(cwd), "war", folderName)
            if os.path.exists(folderPath):
                print("Folder name already exists.")
                sys.exit()
            os.mkdir(folderPath)
            print("Capturing " + str(maxRoundNbr) + " Rounds In Folder: " + folderPath + "...")
    
    # Create folders
    if not os.path.exists(manualCapturePath):
        os.mkdir(manualCapturePath)

    if not os.path.exists(os.path.join(os.getcwd(), "war")):
        os.mkdir(os.path.join(os.getcwd(), "war"))

    card = 2
    if args.card:
        card = args.card
    video = cv2.VideoCapture(int(card))
    video.set(3, 1920)
    video.set(4, 1080)

    if not video.isOpened():
        print("Wrong capture card selected (" + str(card) + "). Try another index.")
        sys.exit()

    # Start Web Server
    os.system("start run_local_server.bat")
    
    # Create a pool of thread
    threads = []  
    
    # Create threads
    if args.auto:
        threads.append(Thread(target=recognize, args=(x,)))
    
    threads.append(Thread(target = scanInput))

    # Start all the threads from the pool
    for t in threads:
        t.start()
    cv2.startWindowThread()
    
    # Wait for all threads to complete
    for t in threads:
        t.join()