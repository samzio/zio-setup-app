import React, { Component } from "react";
import styled from 'styled-components'
import EepromJSON from './EEPROMspec.json'
import ProgressBar from './ProgressBar' 
import InputFieldTypes from './InputFieldTypes'
import { format } from 'date-fns'

//conversion
let enc = new TextDecoder("utf-8");
let buf2Hex = (buffer) => { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

//expected characteristic UUIDs
const btZioServiceUUID = '16d30bc1-f148-49bd-b127-8042df63ded0'
const cmdCharUUID = '16d30bc8-f148-49bd-b127-8042df63ded0'
const flashAddressCharUUID = '16d30bcf-f148-49bd-b127-8042df63ded0'
const flashDataCharUUID = '16d30bd0-f148-49bd-b127-8042df63ded0'
const eraseCmd = 5
const writeCmd = 6

class EepromFields extends Component {

    constructor(props){
        super(props);
        this.state = {
            reading_eeprom: false,          
            read_complete: false,       
            writing_eeprom: false,
            write_complete: false,
            eeprom_progress: 0,
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
        this.setState({reading_eeprom: true, read_complete: false, writing_eeprom: false, write_complete: false, eeprom_progress: 0});
        this.getFlashDataInt(14);
    }

    //process to write the entire contents of the EEPROM
    writeEeprom = async () => {
        this.setState({reading_eeprom: false, read_complete: false, writing_eeprom: true, write_complete: false, eeprom_progress: 0});
        this.writeFlashDataInt(14, 123);
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
            console.log('read: ', result);
            return result;
        }
        catch(e){
            console.log('error reading flash: ', e);
        }
    }

    //Write an Int32 from an EEPROM address
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
        }
        catch(e){
            console.log('error writing flash: ', e);
        }        
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
                {this.state.reading_eeprom && ( 
                <ProgressBar percentage={this.state.eeprom_progress}/>
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