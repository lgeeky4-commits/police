"use strict";
// Standalone deployment of the Border Control roleplay game.
const http=require('http');
const path=require('path');
const express=require('express');
const {Server}=require('socket.io');
const app=express();
const server=http.createServer(app);
const io=new Server(server,{maxHttpBufferSize:4*1024*1024});
const publicDir=path.join(__dirname,'public');
require('./border-room.js')(io);
app.get('/health',(_req,res)=>res.json({ok:true,app:'Border Control RP',maxPlayers:4,media:true,walkieTalkie:true}));
// Both paths work. Internal assets still use /border/... as in the RP Hub.
app.get('/',(_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.get('/index.html',(_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.get('/border',(_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use('/border',express.static(publicDir,{index:false}));
// Convenience aliases for individually previewing assets (not needed by the UI).
app.use(express.static(publicDir,{index:false}));
app.use((_req,res)=>res.status(404).type('text/plain').send('Not found'));
const port=Number(process.env.PORT)||3000;
server.listen(port,'0.0.0.0',()=>console.log(`Border Control RP listening on ${port}`));
