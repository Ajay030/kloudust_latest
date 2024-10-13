/** 
 * cloneVM.js - Clones a VM on the same host
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Clones a VM on the same host
 * @param {array} params The incoming params - must be - VM name, Cloned VM name
 */
module.exports.exec = async function(params) {
    const vm = await dbAbstractor.getVM(params[0]);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return false;}
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return false;}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/cloneVM.sh`,
            params[0], params[1]
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(params[1], vm.description, vm.hostname, vm.os, 
            cores, memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}