/**
 * Login for Kloudust web admin. Needs Tekmonks Unified Login
 * to work.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 */

const conf = require(`${KLOUDUST_CONSTANTS.CONF_DIR}/tekmonkslogin.json`);
const API_JWT_VALIDATION = `${conf.tekmonkslogin_backend}/apps/loginapp/validatejwt`;

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
    
    let tokenValidationResult; try {
        tokenValidationResult = await httpClient.fetch(`${API_JWT_VALIDATION}?jwt=${jsonReq.jwt}`);
    } catch (err) {
        LOG.error(`Network error validating JWT token ${jsonReq.jwt}, validation failed.`);
        return CONSTANTS.FALSE_RESULT;
    }

	if (!tokenValidationResult.ok) {
        LOG.error(`Fetch error validating JWT token ${jsonReq.jwt}, validation failed.`);
        return CONSTANTS.FALSE_RESULT;
    }

    const responseJSON = await tokenValidationResult.json();
    if ((!responseJSON.result) || (responseJSON.jwt != jsonReq.jwt)) {
        LOG.error(`Validation error when validating JWT token ${jsonReq.jwt}.`);
        return CONSTANTS.FALSE_RESULT;
    }

    try {
        const _decodeBase64 = string => Buffer.from(string, "base64").toString("utf8");
        const jwtClaims = JSON.parse(_decodeBase64(jsonReq.jwt.split(".")[1]));
        return {...jwtClaims , ...CONSTANTS.TRUE_RESULT};
    } catch (err) {
        LOG.error(`Bad JWT token passwed for login ${jsonReq.jwt}, validation succeeded but decode failed.`);
        return CONSTANTS.FALSE_RESULT;
    }
}

const validateRequest = jsonReq => jsonReq && jsonReq.jwt;