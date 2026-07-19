import os
import zipfile
import tempfile

def create_dataset_a(output_path):
    xml_content = '''<?xml version="1.0" encoding="UTF-8"?>
<UFDR>
    <Contacts>
        <Contact>
            <name>Harish</name>
            <phone>+919876543210</phone>
            <email>harish.a@test.com</email>
        </Contact>
        <Contact>
            <name>Rahul</name>
            <phone>+919876543210</phone>
            <email>rahul.b@test.com</email>
        </Contact>
        <Contact>
            <name>Sneha</name>
            <phone>+919000000001</phone>
            <email>harish.a@test.com</email>
        </Contact>
        <Contact>
            <name>Ankit</name>
            <phone>+919000000002</phone>
            <email>ankit.d@test.com</email>
        </Contact>
        <Contact>
            <name>Vikram</name>
            <phone>+919000000003</phone>
            <email>vikram.e@test.com</email>
        </Contact>
    </Contacts>
    <Locations>
        <Location>
            <owner>Harish</owner>
            <coordinates>12.9716, 77.5946</coordinates>
            <timestamp>2023-10-01T10:05:00Z</timestamp>
        </Location>
        <Location>
            <owner>Sneha</owner>
            <coordinates>12.9716, 77.5946</coordinates>
            <timestamp>2023-10-01T10:05:00Z</timestamp>
        </Location>
        <Location>
            <owner>Rahul</owner>
            <coordinates>13.0827, 80.2707</coordinates>
            <timestamp>2023-10-01T11:00:00Z</timestamp>
        </Location>
        <Location>
            <owner>Ankit</owner>
            <coordinates>13.0827, 80.2707</coordinates>
            <timestamp>2023-10-01T11:00:00Z</timestamp>
        </Location>
        <Location>
            <owner>Vikram</owner>
            <coordinates>28.7041, 77.1025</coordinates>
            <timestamp>2023-10-01T12:00:00Z</timestamp>
        </Location>
    </Locations>
    <Messages>
        <Message>
            <owner>Harish</owner>
            <type>WhatsApp</type>
            <to>Rahul</to>
            <content>Hey, are we still meeting?</content>
            <timestamp>2023-10-01T09:30:00Z</timestamp>
        </Message>
        <Message>
            <owner>Rahul</owner>
            <type>SMS</type>
            <to>Harish</to>
            <content>Yes, on my way.</content>
            <timestamp>2023-10-01T09:42:00Z</timestamp>
        </Message>
    </Messages>
</UFDR>
'''
    with zipfile.ZipFile(output_path, 'w') as zf:
        zf.writestr('Dataset_A.xml', xml_content)
    print(f"Created {output_path}")

if __name__ == "__main__":
    os.makedirs('uploads', exist_ok=True)
    create_dataset_a('uploads/Dataset_A_Tiny.zip')
