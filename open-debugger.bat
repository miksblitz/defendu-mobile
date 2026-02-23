@echo off
REM Opens the React Native debugger in your default browser.
REM Use this when "Open Debugger" on the phone opens a PC popup that says "cannot reach the site".
REM Metro is usually on 8081; with tunnel or a second app it may be 8082.
start http://localhost:8081/debugger-ui
REM If that tab fails to load, try: http://localhost:8082/debugger-ui
