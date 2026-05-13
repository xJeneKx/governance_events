const DAG = require('aabot/dag.js');
const crypto = require('crypto');

async function treatResponseFromGovernanceAA(objResponse, asset){
	const objTriggerJoint = await DAG.readJoint(objResponse.trigger_unit);
	if (!objTriggerJoint)
		throw Error('trigger unit not found ' + objResponse.trigger_unit);
	const objTriggerUnit = objTriggerJoint.unit;
	const data = getTriggerUnitData(objTriggerUnit);
	const governanceAAAddress = objResponse.aa_address;

	let event = {
		aa_address: governanceAAAddress,
		trigger_address: objResponse.trigger_address,
		trigger_unit: objResponse.trigger_unit,
		obj_response_unit: objResponse.objResponseUnit,
		timestamp: objTriggerUnit.timestamp
	}

	if (data.name){
		event.name = data.name;
		if (data.commit) {
			event.type = "commit";
			event.value = await DAG.readAAStateVar(governanceAAAddress, data.name);
		} else {
			event.leader_value = await DAG.readAAStateVar(governanceAAAddress, 'leader_' + data.name);
			event.leader_support = await DAG.readAAStateVar(governanceAAAddress, 'support_' + data.name + '_' + event.leader_value)
			if (data.value === undefined){
				event.type = "removed_support";
			} else {
				event.type = "added_support";
				event.value = data.value;
				event.added_support = await DAG.readAAStateVar(governanceAAAddress, 'balance_' + objResponse.trigger_address);
				event.support = await DAG.readAAStateVar(governanceAAAddress, 'support_' + data.name + '_' + getValueKey(data.value));
			}
		}
	}
	if (data.withdraw) {
		event.type = "withdraw";
		event.amount = getAmountFromUnit(objResponse.objResponseUnit, objResponse.trigger_address, asset);
	}

	return event;
}

function getValueKey(value){
	return (('support_oracles_' + value+ '_').length + 32) > 128 ? 
	crypto.createHash("sha256").update(value, "utf8").digest("base64") : value;
}

function getTriggerUnitData(objTriggerUnit){
	for (var i=0; i < objTriggerUnit.messages.length; i++)
	if (objTriggerUnit.messages[i].app === 'data') // AA considers only the first data message
		return objTriggerUnit.messages[i].payload;
	return {};
}

function getAmountFromUnit(objUnit, to_address, asset = 'base'){
	if (!objUnit)
		return 0;
	let amount = 0;
	objUnit.messages.forEach(function (message){
		if (message.app !== 'payment')
			return;
		const payload = message.payload;
		if (asset == 'base' && payload.asset || asset != 'base' && asset !== payload.asset)
			return;
		payload.outputs.forEach(function (output){
			if (output.address === to_address) {
				amount += output.amount; // in case there are several outputs
			}
		});
	});
	return amount;
}

exports.treatResponseFromGovernanceAA = treatResponseFromGovernanceAA;