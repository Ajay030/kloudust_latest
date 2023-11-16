/** 
 * getHostInfo.js - Queries the given host information and prints it
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
 
/**
 * Queries the given host information and prints it
 * @param {array} params The incoming params - must be host name or IP
 */
module.exports.exec = async function(params) {
    const hostInfo = await dbAbstractor.getHostEntry(params[0]); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    let formattedOut = ""; for (const key of Object.keys(hostInfo)) formattedOut = formattedOut+"\n"+key+" - "+hostInfo[key];

    params.consoleHandlers.LOGINFO(`Host information follows for ${params[0]}`+formattedOut);

    return {result: true, err: "", out: ""};
}