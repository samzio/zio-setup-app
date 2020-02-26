import React, { Component } from "react";
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

class InputFieldTypes extends Component {

    constructor(props){
        super(props);
    }

    handleValueChange = (event) => {
        event.preventDefault();
        this.props.on_update_value(event.target.name, event.target.value);
    }

    handleDateChange = (name, date) => {
        this.props.on_update_value(name, date);
    }

    render() 
    {
        let e = this.props.eeprom_field;
        let val = this.props.current_value;
        let inputField;

        //selects the correct input field
        if(e.input_type === "text")
        {
            inputField = <input type="text" value={val || ""} autoComplete="off" name={e.name} onChange={this.handleValueChange} />
        }
        else if(e.input_type === "number")
        {
            inputField = <input type="number" value={val || ""} autoComplete="off" name={e.name} onChange={this.handleValueChange} />
        }
        else if(e.input_type === "date")
        {
            inputField = <DatePicker selected={val || ""} strictParsing autoComplete="off" dateFormat="yyyy/MM/dd" name={e.name} onChange={date => this.handleDateChange(e.name, date)} />
        }

        return (
            <span title={e.input_desc}>{inputField}</span>    
        )   
    }
}

export default InputFieldTypes