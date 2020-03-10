import React, { Component } from "react";
import EepromJSON from './EEPROMspec.json'
import ProgressBar from './ProgressBar' 
import InputFieldTypes from './InputFieldTypes'
import { isValid, format } from 'date-fns'

//conversion
let enc = new TextDecoder("utf-8");

//expected characteristic UUIDs
const btZioServiceUUID = '16d30bc1-f148-49bd-b127-8042df63ded0'
const cmdCharUUID = '16d30bc8-f148-49bd-b127-8042df63ded0'
const flashAddressCharUUID = '16d30bcf-f148-49bd-b127-8042df63ded0'
const flashDataCharUUID = '16d30bd0-f148-49bd-b127-8042df63ded0'
const eraseCmd = 5
const writeCmd = 6

function toUTF8Array(str) {
    var utf8 = [];
    if(str!=null){
        for (var i=0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 0x80) utf8.push(charcode);
            else if (charcode < 0x800) {
                utf8.push(0xc0 | (charcode >> 6), 
                        0x80 | (charcode & 0x3f));
            }
            else if (charcode < 0xd800 || charcode >= 0xe000) {
                utf8.push(0xe0 | (charcode >> 12), 
                        0x80 | ((charcode>>6) & 0x3f), 
                        0x80 | (charcode & 0x3f));
            }
            // surrogate pair
            else {
                i++;
                charcode = (((charcode&0x3ff)<<10)|(str.charCodeAt(i)&0x3ff)) + 0x010000;
                utf8.push(0xf0 | (charcode >>18), 
                        0x80 | ((charcode>>12) & 0x3f), 
                        0x80 | ((charcode>>6) & 0x3f), 
                        0x80 | (charcode & 0x3f));
            }
        }
    }
    return utf8;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class EepromFields extends Component {

    constructor(props){
        super(props);
        this.state = {
            eeprom_operation_in_progress: false,
            eeprom_progress_percentage: 0,
            have_import_file: false,
            erase_function_enabled: false,
        }
    }

    componentDidMount(){
        this.getBtService();
    }

    //get relevant bluetooth components
    getBtService = async () => {
        try
        {
            let btServer = await this.props.device.gatt.connect();
            let btZioService = await btServer.getPrimaryService(btZioServiceUUID);
            let btCmdChar = await btZioService.getCharacteristic(cmdCharUUID);
            let btflashAddressChar = await btZioService.getCharacteristic(flashAddressCharUUID);
            let btflashDataChar = await btZioService.getCharacteristic(flashDataCharUUID);
            this.setState({
                device: this.props.device,
                server: btServer,
                service: btZioService,
                cmdChar: btCmdChar,
                flashAddressChar: btflashAddressChar,
                flashDataChar: btflashDataChar,
            })
            console.log(this.state);
        }
        catch(error)
        {
            console.log("error", error)
        }  
    }
    
    //process to read the entire contents of the EEPROM
    readEeprom = async () => {
        
        //read in progress
        this.setState({eeprom_operation_in_progress: true, eeprom_progress_percentage: 0, progress_bar_message: 'reading'});
        
        //read & save entire eeprom to array
        let eepromValues = [];
        for(var i = 0; i < EepromJSON.array.length; i++){
            eepromValues = eepromValues.concat(await this.getFlashDataArray(EepromJSON.array[i].address, EepromJSON.array[i].length));
            var per = 100 * ((i + 1) / EepromJSON.array.length);
            this.setState({eeprom_progress_percentage: per});
        }
        console.log('values read from eeprom: ', eepromValues);

        //convert array and set it to state
        var address_i = 0;
        for(i = 0; i < EepromJSON.array.length; i++){

            //if its our hardware revision special case
            if(EepromJSON.array[i].name === "hw_rev"){

                //convert eepromValues[address_i] to hw rev string
                let arr = new ArrayBuffer(4)
                let dv = new DataView(arr);
                dv.setUint32(0, eepromValues[address_i], false);
                var hw_rev_str = dv.getUint8(1).toString() + '.' + dv.getUint8(2).toString() + '.'+ dv.getUint8(3).toString()
                this.setState({
                    [EepromJSON.array[i].name]: hw_rev_str,
                });   

                //next address
                address_i++;
            }

            //if it is a number
            else if((EepromJSON.array[i].input_type === "number")||(EepromJSON.array[i].input_type === "count")){

                //make sure it is only one uint32 long
                if(EepromJSON.array[i].length === 1){
                    //if it is a blank eeprom value (0xffffffff)
                    if(eepromValues[address_i] === 0xffffffff){
                        //save it as blank
                        this.setState({
                            [EepromJSON.array[i].name]: '',
                        });  
                    }
                    else{
                        //save value
                        this.setState({
                            [EepromJSON.array[i].name]: eepromValues[address_i].toString(),
                        });      
                    }

                                 
                }

                //next address
                address_i++;
            }

            //if it is text
            else if(EepromJSON.array[i].input_type === "text"){
         
                let length = EepromJSON.array[i].length;
                let textAsBytesArray = [];
                //separate each uint32 to uint8 bytes for the whole length of the string
                for(var j = 0; j < length; j++){
                    let arr = new ArrayBuffer(4)
                    let dv = new DataView(arr);
                    dv.setUint32(0, eepromValues[address_i + j], false);   
                    textAsBytesArray.push(dv.getUint8(0));
                    textAsBytesArray.push(dv.getUint8(1));
                    textAsBytesArray.push(dv.getUint8(2));
                    textAsBytesArray.push(dv.getUint8(3));
                }

                //convert the array to utf-8
                var utf8string = enc.decode(Uint8Array.from(textAsBytesArray));
                this.setState({
                    [EepromJSON.array[i].name]: utf8string,
                });               
                
                //next address
                address_i += length;
            }
            
            //if it is a date
            else if(EepromJSON.array[i].input_type === "date"){

                //make sure it is only one uint32 long
                if(EepromJSON.array[i].length === 1){

                    //extract date yyyyMMdd
                    var year = Math.round(eepromValues[address_i] / 10000);
                    var month =  Math.round((eepromValues[address_i] % 10000) / 100);
                    var day =  Math.round(eepromValues[address_i] % 100);
                    var date = year + '/' + month + '/' + day;
                    date = new Date(date);
                    
                    //check for valid date
                    if(!isNaN(date)){
                        this.setState({
                            [EepromJSON.array[i].name]: date,
                        });
                    }
                    //set blank
                    else{
                        this.setState({
                            [EepromJSON.array[i].name]: '',
                        });
                    }
                }

                //next address
                address_i++;
            }            
        }

        //done
        this.setState({eeprom_operation_in_progress: false, eeprom_progress_percentage: 100, progress_bar_message: ''});

        //once done enable erase
        this.setState({erase_function_enabled: true});
    }

    //process to write the entire contents of the EEPROM
    writeEeprom = async () => {

        //check regex for each string input
        for(var k = 0; k < EepromJSON.array.length; k++){
            if(EepromJSON.array[k].input_type === "text"){
                console.log(this.state[EepromJSON.array[k].name])
                var str = this.state[EepromJSON.array[k].name] ? this.state[EepromJSON.array[k].name] : ''
                //regex check
                if(str && !str.match(EepromJSON.array[k].regex)){
                    alert(EepromJSON.array[k].full_name + ' field is in the incorrect format');
                    return
                }
            }
        }

        //must erase first!
        await this.eraseFlashData();
        console.log('erase complete')

        //write in progress
        this.setState({eeprom_operation_in_progress: true, eeprom_progress_percentage: 0, progress_bar_message: 'writing'});

        //convert all the values from the state into a uint32 array 
        let eepromValues = [];
        var address_i = 0;
        for(var i = 0; i < EepromJSON.array.length; i++){

            //if its our hardware revision special case
            if(EepromJSON.array[i].name === "hw_rev"){

                //convert this.state[EepromJSON.array[i].name] to uint32
                if(this.state[EepromJSON.array[i].name])
                {
                    var digit_chars = this.state[EepromJSON.array[i].name].split('.')
                    let arr = new ArrayBuffer(4)
                    let dv = new DataView(arr)
                    console.log(digit_chars)
                    dv.setUint8(0, 0);
                    dv.setUint8(1, parseInt(digit_chars[0]));
                    dv.setUint8(2, parseInt(digit_chars[1]));
                    dv.setUint8(3, parseInt(digit_chars[2]));
                    eepromValues[address_i] = dv.getUint32(0)
                    console.log(eepromValues[address_i])
                }
                //else it is a blank string
                else{
                    eepromValues[address_i] = 0
                }

                //next address
                address_i++;
            }
            
            //if it is a number or count
            else if((EepromJSON.array[i].input_type === "number")||(EepromJSON.array[i].input_type === "count")){

                //make sure it is only one uint32 long
                if(EepromJSON.array[i].length === 1){
                    eepromValues[address_i] = this.state[EepromJSON.array[i].name];
                }

                //next address
                address_i++;
            }

            //if it is text
            else if(EepromJSON.array[i].input_type === "text"){
         
                let length = EepromJSON.array[i].length;

                //convert our string to utf-8
                var utf8str = toUTF8Array(this.state[EepromJSON.array[i].name]);

                //set the array with the utf bytes
                for(var j = 0; j < length; j++){
                    //combine utf-8 bytes into uint32 number
                    let arr = new ArrayBuffer(4)
                    let dv = new DataView(arr);                 
                    for(var b = 0; b < 4; b++){
                        //set dataview bytes
                        if(b+(4*j) < utf8str.length){
                            dv.setUint8(b, utf8str[b+(4*j)])
                        }
                        //set the remaining bytes to zero
                        else{
                            dv.setUint8(b, 0);
                        }
                    }
                    //set value to the uint32 of the dataview
                    var value = dv.getUint32(0);
                    eepromValues[address_i + j] = value;
                }

                //next address
                address_i += length;
            }
            
            //if it is a date
            else if(EepromJSON.array[i].input_type === "date"){

                //make sure it is only one uint32 long
                if(EepromJSON.array[i].length === 1){
                    var d = new Date(this.state[EepromJSON.array[i].name]);
                    eepromValues[address_i] = (d.getFullYear() * 10000) + ((d.getMonth() + 1) * 100) + d.getDate();
                }

                //next address
                address_i++;
            }                      
        }

        console.log('values to write to eeprom: ', eepromValues);

        //write eeprom array   
        for(var addr = 0; addr < eepromValues.length; addr++){
            
            //check for null and undefined 
            if((eepromValues[addr] === undefined)||isNaN(eepromValues[addr])||(eepromValues[addr] == null)){
                eepromValues[addr] = 0xffffffff;
            }

            //write
            await this.writeFlashDataInt(addr, eepromValues[addr]);
            var per = 20 + 80 * ((addr + 1) / eepromValues.length);
            this.setState({eeprom_progress_percentage: per});
        }

        //update status message
        if(this.state.bt_adv_name !== ''){
            this.props.update_status_msg('Connected to ' + this.state.bt_adv_name)
        }

        //done
        this.setState({eeprom_operation_in_progress: false, eeprom_progress_percentage: 100, progress_bar_message: ''});
    }

    //erase all data in the EEPROM
    eraseFlashData = async () => {
        try{
            this.setState({eeprom_operation_in_progress: true, eeprom_progress_percentage: 0, progress_bar_message: 'erasing'});        
            await this.state.cmdChar.writeValue(Uint8Array.of(eraseCmd))
            await this.waitForCmdComplete(5);
            this.setState({eeprom_operation_in_progress: false, eeprom_progress_percentage: 100, progress_bar_message: ''});  
        }
        catch(e){
            console.log('error erasing flash: ', e);
        }
    }

    //function that waits for the command status to be zero
    waitForCmdComplete = async (maxSeconds) => {
        
        //loop to check for completion
        var secondsRemaining = maxSeconds;
        do{
            //get a result
            let result = await this.getCmdStatus();
            if(result === 0){
                this.setState({eeprom_operation_in_progress: false, eeprom_progress_percentage: 100});  
                return true;
            }

            //sleep 1 second
            await sleep(1000);
            secondsRemaining--;
            var percentage = 100 * ((maxSeconds - secondsRemaining) / maxSeconds);
            this.setState({eeprom_operation_in_progress: true, eeprom_progress_percentage: percentage});  
        }
        //if we havent timed out
        while(secondsRemaining > 0);

        console.log('command timed out')
        return false
    }

    //get the cmdChar value to determine the CMD result status
    getCmdStatus = async () => {
        let val = await this.state.cmdChar.readValue();
        let result = await val.getUint8(0);
        this.setState({cmdStatus: result})
        return await result;
    }

    //process to get form values from file
    getValuesFromFile = async () => {
        if(this.state.have_import_file){
            var valuesObj = JSON.parse(this.state.importFile);
            //go through array in the valuesObj
            for(var i = 0; i < valuesObj.array.length; i++){
                //ge the key name of the value
                var value_name = EepromJSON.array[i].name;
                //if the value is a date
                if(EepromJSON.array[i].input_type === "date")
                {
                    //save to state as date
                    var date_fmt = new Date(valuesObj.array[i][value_name]);
                    this.setState({
                        [value_name]: date_fmt,
                    })
                }
                else
                {
                    //save to state
                    this.setState({
                        [value_name]: valuesObj.array[i][value_name],
                    })
                }
            }
        }
    }

    //save form values to file
    saveValuesToFile = async () => {
        var outputObj = [];
        //go through all the keys in the EepromJSON
        for(var i = 0; i < EepromJSON.array.length; i++){       
            //if the value is a date
            if(EepromJSON.array[i].input_type === "date")
            {
                var date_fmt = NaN;
                //check if date field is valid
                if(isValid(this.state[EepromJSON.array[i].name])){
                    date_fmt = format(this.state[EepromJSON.array[i].name], 'yyyy/MM/dd');
                }                
                outputObj.push({[EepromJSON.array[i].name]: date_fmt})
            }
            else
            {
                outputObj.push({[EepromJSON.array[i].name]: this.state[EepromJSON.array[i].name]})
            }
        }
        const fileName = "Eeprom_value_template";
        const json = '{"array":' + JSON.stringify(outputObj) + '}';
        const blob = new Blob([json],{type:'application/json'});
        const href = await URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = fileName + ".json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    //update this.state from Child
    updateStateFromChild = (name, value) => {
        this.setState({
            [name]: value,
        })
    }

    //reads the values from file
    handleFileInputChange = (event) => {
        var fr = new FileReader();
        var input_file = event.target.files[0];
        if(input_file != null){
            //function for when the filereader is finished
            fr.onload = (e) =>
            { 
                this.setState({importFile: e.target.result, have_import_file: true})
                console.log(this.state.importFile)
            }
            //begin reading the file
            fr.readAsText(input_file); 
        }
    }

    //Read an Int32 from an EEPROM address
    getFlashDataInt = async (address) => {
        try{        
            //write address to flashAddressChar
            let dv = new DataView(new ArrayBuffer(4));
            dv.setUint32(0, address, false);
            await this.state.flashAddressChar.writeValue(dv.buffer);
            
            //read address from flashDataChar
            let dataVal = await this.state.flashDataChar.readValue();
            let result = await dataVal.getUint32(0, true);
            // console.log('read: ' + result + ' from address ' + address);
            return await result;
        }
        catch(e){
            console.log('error reading flash: ', e);
            return 0;
        }
    }

    //Write an Int32 to an EEPROM address
    writeFlashDataInt = async (address, value) => {
        try{        
            //write address to flashAddressChar
            let dv1 = new DataView(new ArrayBuffer(4));
            dv1.setUint32(0, address, false);
            await this.state.flashAddressChar.writeValue(dv1.buffer);
            
            //write value to flashDataChar
            let dv2 = new DataView(new ArrayBuffer(4));
            dv2.setUint32(0, value, false);
            await this.state.flashDataChar.writeValue(dv2.buffer);
            
            //write writeCmd to the cmdChar
            await this.state.cmdChar.writeValue(Uint8Array.of(writeCmd));

            // console.log('wrote: ' + value + ' to address ' + address);
        }
        catch(e){
            console.log('error writing flash: ', e);
        }        
    }

    //Read an array of Int32 from an EEPROM address
    getFlashDataArray = async (address, length) => {
        var flashData = [];
        for(var i = 0; i < length; i++)
        {
            var result = await this.getFlashDataInt(address + i);
            flashData.push(result);
        }
        return await flashData;
    }
    
    render() {
        //return
        return (
            <div>
                {/* Read/Write Buttons */}
                <div>
                    <button onClick={this.readEeprom} disabled={this.state.eeprom_operation_in_progress}>Read All Data</button>
                    <button onClick={this.writeEeprom} disabled={this.state.eeprom_operation_in_progress}>Write All Data</button>
                    <button onClick={this.eraseFlashData} disabled={!this.state.erase_function_enabled || this.state.eeprom_operation_in_progress}>Erase All Data</button>
                </div>
                
                {/* Import/Export values from file */}
                <div>
                    <input type="file" accept=".json" autoComplete="off" onChange={this.handleFileInputChange} disabled={this.state.eeprom_operation_in_progress}/>
                    <div>
                        <button onClick={this.getValuesFromFile} disabled={this.state.eeprom_operation_in_progress}>Import Values from File</button>
                        <button onClick={this.saveValuesToFile} disabled={this.state.eeprom_operation_in_progress}>Export Values to File</button>
                    </div>
                </div>

                {/* Show/Hide Eeprom Progress Bar */}
                {this.state.eeprom_operation_in_progress && ( 
                <ProgressBar message={this.state.progress_bar_message} percentage={this.state.eeprom_progress_percentage}/>
                )}   
                
                {/* All Eeprom Fields */}
                {EepromJSON.array.map(e => 
                    <InputFieldTypes key={e.name} eeprom_field={e} current_value={this.state[e.name]} on_update_value={this.updateStateFromChild} />          
                )}
            </div>
        )
    }
}

export default EepromFields