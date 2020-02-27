import React, { Component } from "react";
import EepromJSON from './EEPROMspec.json'
import ProgressBar from './ProgressBar' 
import InputFieldTypes from './InputFieldTypes'
import { format } from 'date-fns'

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

class EepromFields extends Component {

    constructor(props){
        super(props);
        this.state = {
            eeprom_operation_in_progress: false,
            eeprom_progress_percentage: 0,
            have_import_file: false,
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
        this.setState({eeprom_operation_in_progress: true, eeprom_progress_percentage: 0});
        
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

            //if it is a number
            if(EepromJSON.array[i].input_type === "number"){

                //make sure it is only one uint32 long
                if(EepromJSON.array[i].length === 1){
                    this.setState({
                        [EepromJSON.array[i].name]: eepromValues[address_i].toString(),
                    });                   
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
                console.log(utf8string);
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
                }

                //next address
                address_i++;
            }            
        }

        //done
        this.setState({eeprom_operation_in_progress: false, eeprom_progress_percentage: 100});
    }

    //process to write the entire contents of the EEPROM
    writeEeprom = async () => {
        
        //write in progress
        this.setState({eeprom_operation_in_progress: true, eeprom_progress_percentage: 0});

        //must erase first!
        this.eraseFlashData();
        this.setState({eeeprom_progress_percentage: 20});

        //convert all the values from the state into a uint32 array 
        let eepromValues = [];
        var address_i = 0;
        for(var i = 0; i < EepromJSON.array.length; i++){

            //if it is a number
            if(EepromJSON.array[i].input_type === "number"){

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
                    eepromValues[address_i] = (d.getFullYear() * 10000) + (d.getMonth() * 100) + d.getDate();
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

        //done
        this.setState({eeprom_operation_in_progress: false, eeprom_progress_percentage: 100});
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
                var date_fmt = format(this.state[EepromJSON.array[i].name], 'yyyy/MM/dd');
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

    //erase all data in the EEPROM
    eraseFlashData = async () => {
        try{        
            await this.state.cmdChar.writeValue(Uint8Array.of(eraseCmd));
        }
        catch(e){
            console.log('error erasing flash: ', e);
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
            console.log('read: ' + result + ' from address ' + address);
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

            console.log('wrote: ' + value + ' to address ' + address);
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
        return (
            <div>
                {/* Read/Write Buttons */}
                <div>
                    <button onClick={this.readEeprom}>Read All Data</button>
                    <button onClick={this.writeEeprom}>Write All Data</button>
                    <button onClick={this.eraseFlashData}>Erase All Data</button>
                </div>
                
                {/* Import/Export values from file */}
                <div>
                    <input type="file" accept=".json" autoComplete="off" onChange={this.handleFileInputChange} />
                    <div>
                        <button onClick={this.getValuesFromFile}>Import Values from File</button>
                        <button onClick={this.saveValuesToFile}>Export Values to File</button>
                    </div>
                </div>

                {/* Show/Hide Eeprom Progress Bar */}
                {this.state.eeprom_operation_in_progress && ( 
                <ProgressBar percentage={this.state.eeprom_progress_percentage}/>
                )}   
                
                {/* All Eeprom Fields */}
                {EepromJSON.array.map(e => 
                <li key={e.name}>
                    <span title={e.description}>{e.full_name}</span> : 
                    <InputFieldTypes eeprom_field={e} current_value={this.state[e.name]} on_update_value={this.updateStateFromChild} />          
                </li>)}
            </div>
        )
    }
}

export default EepromFields