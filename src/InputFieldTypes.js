import React, { Component } from "react";
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import warning_icon from './warning_icon.png';

//conversion
let enc = new TextDecoder("utf-8");

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

class InputFieldTypes extends Component {

    handleNumberChange = (event) => {
        event.preventDefault();
        this.props.on_update_value(event.target.name, event.target.value);
    }

    handleTextChange = (max_bytes, regex, event) => {
        event.preventDefault();

        //ensure string does not exceed max bytes
        var str = this.clampStringLength(event.target.value, max_bytes)
        this.props.on_update_value(event.target.name, str);      
        
        //also update the count field
        var count_name = event.target.name + '_count'
        var length = toUTF8Array(str).length
        this.props.on_update_value(count_name, length);
    }

    handleDateChange = (name, date) => {
        this.props.on_update_value(name, date);
    }

    clampStringLength = (str, max_bytes) => {
        //check str exists
        if(str){
            //convert our string to utf-8
            var utf8str = toUTF8Array(str);

            //get length of string
            var length = 0;
            for(var i = 0; i < max_bytes; i++){
                if(i < utf8str.length){    
                    //check end of string         
                    if((utf8str[i] === 0x00) || (utf8str[i] === 0xff))
                    {
                        break;
                    }
                    else{                        
                        length++;
                    }
                }
            }

            //set each byte to the data view
            let arr = new ArrayBuffer(length)
            let dv = new DataView(arr);
            for(var j = 0; j < length; j++){
                dv.setUint8(j, utf8str[j])
            }
            
            //convert dataview back to string
            var new_str = enc.decode(arr)
            return new_str
        }

        //else return empty string
        return ""      
    }

    render() 
    {
        let e = this.props.eeprom_field;
        let val = this.props.current_value;
        let inputField;
        let show_input_error = false;
        let is_locked = (e.locked === "true")

        //selects the correct input field
        if(e.input_type === "text")
        {
            //clamp text
            val = this.clampStringLength(val, e.max_bytes)
            
            inputField = <input 
                type="text" 
                value={val} 
                autoComplete="off" 
                name={e.name} 
                onChange={(event) => this.handleTextChange(e.max_bytes, e.regex, event)} 
                disabled={is_locked}
            />

            //check regex
            show_input_error = (!val || val.match(e.regex)) ? false : true
        }
        else if(e.input_type === "number")
        {         
            inputField = <input type="number" value={val || ""} autoComplete="off" name={e.name} onChange={this.handleNumberChange} disabled={is_locked}/>
        }
        else if(e.input_type === "count")
        {
            inputField = <input type="number" value={val || ""} autoComplete="off" name={e.name} onChange={this.handleNumberChange} disabled/>
        }
        else if(e.input_type === "date")
        {
            inputField = <DatePicker selected={val || ""} strictParsing autoComplete="off" dateFormat="yyyy/MM/dd" name={e.name} onChange={date => this.handleDateChange(e.name, date)} />
        }

        return (
            <div>          
                <span title={e.description}>{e.full_name} : </span>
                <span title={e.input_desc}>{inputField}</span>
                {show_input_error && ( 
                    <img src={warning_icon} alt="incorrect input" title={e.input_desc} width="20" height="20"/>
                )}
            </div>    
        )   
    }
}

export default InputFieldTypes