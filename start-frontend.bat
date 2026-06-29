@echo off
title ZeTheta DEX - Frontend (port 3000)
cd /d D:\Projject\Decentralize_order_book\packages\frontend
node --max-old-space-size=4096 node_modules\next\dist\bin\next dev --port 3000
pause
